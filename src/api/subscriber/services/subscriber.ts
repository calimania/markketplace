/**
 * subscriber service
 */

import { factories } from '@strapi/strapi';
import { decryptCredentials } from '../../../services/encryption';
import { ensureStoreDefaultSendGridList, sendWelcomeEmail, upsertContactToList } from '../../../services/sendgrid-marketing';
import { buildWelcomeEmailHtml } from '../../../services/sendgrid-email-templates';

interface SubscribeAndQueueSyncInput {
  email: string;
  storeDocumentId: string;
  firstName?: string;
  lastName?: string;
  source?: string;
  syncImmediately?: boolean;
}

interface TriggerSubscriberResyncInput {
  subscriberDocumentId: string;
  storeDocumentId: string;
}

function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function buildDefaultListSlug(storeDocumentId: string): string {
  return `store-${storeDocumentId}-all`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80);
}

function isWelcomeEmailEnabled(store: any): boolean {
  const newsletterSettings = store?.settings?.newsletter_settings || {};

  // Preferred flag names for flexibility during rollout.
  // TODO(newsletter-phase-2): Standardize on one schema key in store-setting (e.g. newsletter_settings.welcome_email_enabled).
  if (newsletterSettings?.welcome_email_enabled === false) {
    return false;
  }

  if (newsletterSettings?.send_welcome_email === false) {
    return false;
  }

  return true;
}

async function findSendGridExtensionForStore(strapi: any, storeDocumentId: string): Promise<any | null> {
  const store = await (strapi.documents('api::store.store') as any).findOne({
    documentId: storeDocumentId,
    populate: ['extensions']
  }) as any;

  if (!store?.extensions?.length) {
    return null;
  }

  return store.extensions.find((ext: any) => ext?.active !== false && String(ext?.key || '').includes('sendgrid')) || null;
}

function resolveSendGridCredentialsForNewsletter(extension: any): { api_key: string; use_default?: boolean } | null {
  // TODO(newsletter-phase-2): Re-introduce store-level credential strategy for business tiers/UX.
  // Current behavior is intentionally env-first for rollout stability.
  // Future direction:
  // - Read store setting/flag (e.g. settings.newsletter_settings.use_store_credentials)
  // - If true and extension credentials exist, prefer store credentials
  // - Otherwise use platform default SENDGRID_API_KEY
  if (process.env.SENDGRID_API_KEY) {
    return {
      api_key: '',
      use_default: true
    };
  }

  if (extension?.credentials) {
    return decryptCredentials(extension.credentials);
  }

  return null;
}

/**
 * TODO(newsletter-phase-1): Service responsibilities
 * - resolve store + list context using documentId (never slug)
 * - upsert subscriber-list-membership records
 * - call sendgrid-marketing service abstraction
 * - track sync status transitions: pending -> synced|failed
 * - support manual re-sync for a subscriber or a specific list
 */

export default factories.createCoreService('api::subscriber.subscriber', ({ strapi }) => ({
  async subscribeAndQueueSync(input: SubscribeAndQueueSyncInput) {
    // TODO(newsletter-phase-2): Move subscribe ingress to browser -> Next.js tokenized endpoint -> Strapi.
    // Current phase keeps browser -> Strapi unchanged to avoid client breaking changes.
    const subscriberDocuments = strapi.documents('api::subscriber.subscriber') as any;
    const listDocuments = (strapi.documents as any)('api::subscriber.subscriber-list');
    const membershipDocuments = (strapi.documents as any)('api::subscriber.subscriber-list-membership');

    const email = normalizeEmail(input?.email);
    const storeDocumentId = String(input?.storeDocumentId || '').trim();

    if (!email || !storeDocumentId) {
      return {
        success: false,
        message: 'email and storeDocumentId are required',
        error: 'missing_required_fields'
      };
    }

    const existingSubscribers = await subscriberDocuments.findMany({
      filters: { Email: { $eqi: email } },
      populate: ['stores', 'lists'],
      limit: 1
    }) as any[];

    let subscriber = existingSubscribers?.[0] || null;

    if (!subscriber) {
      subscriber = await subscriberDocuments.create({
        data: {
          Email: email,
          active: true,
          stores: [storeDocumentId],
          sync_status: 'pending'
        },
        status: 'published',
        populate: ['stores', 'lists']
      });
    } else {
      const existingStoreIds = (subscriber.stores || []).map((store: any) => store.documentId).filter(Boolean);
      const nextStoreIds = Array.from(new Set([...existingStoreIds, storeDocumentId]));

      subscriber = await subscriberDocuments.update({
        documentId: subscriber.documentId,
        data: {
          active: true,
          stores: nextStoreIds,
          sync_status: 'pending',
          unsubscribed_at: null
        },
        status: 'published',
        populate: ['stores', 'lists']
      });
    }

    const existingLists = await listDocuments.findMany({
      filters: {
        store: { documentId: { $eq: storeDocumentId } },
        is_default: { $eq: true },
        active: { $eq: true }
      },
      limit: 1,
      populate: ['store']
    }) as any[];

    let targetList = existingLists?.[0] || null;

    if (!targetList) {
      targetList = await listDocuments.create({
        data: {
          name: 'All Subscribers',
          slug: buildDefaultListSlug(storeDocumentId),
          list_type: 'default',
          is_default: true,
          store: storeDocumentId,
          active: true,
          sync_status: 'pending'
        },
        status: 'published'
      });
    }

    const existingMembership = await membershipDocuments.findMany({
      filters: {
        subscriber: { documentId: { $eq: subscriber.documentId } },
        list: { documentId: { $eq: targetList.documentId } }
      },
      limit: 1
    }) as any[];

    if (!existingMembership?.length) {
      await membershipDocuments.create({
        data: {
          subscriber: subscriber.documentId,
          list: targetList.documentId,
          status: 'subscribed',
          subscribed_at: new Date().toISOString(),
          source: input?.source || 'api_subscribe',
          last_synced_at: null
        }
      });
    } else {
      await membershipDocuments.update({
        documentId: existingMembership[0].documentId,
        data: {
          status: 'subscribed',
          unsubscribed_at: null,
          unsubscribe_reason: null
        }
      });
    }

    const queueAsyncSyncRetry = () => setImmediate(async () => {
      try {
        await (strapi.service('api::subscriber.subscriber') as any).syncSubscriberToSendGrid({
          subscriberDocumentId: subscriber.documentId,
          storeDocumentId
        });
      } catch (error: any) {
        console.error('[SUBSCRIBER_SYNC] async sync failed:', error.message);
      }
    });

    const syncImmediately = input?.syncImmediately !== false;

    if (syncImmediately) {
      try {
        const syncResult = await (strapi.service('api::subscriber.subscriber') as any).syncSubscriberToSendGrid({
          subscriberDocumentId: subscriber.documentId,
          storeDocumentId
        });

        if (syncResult?.success) {
          return {
            success: true,
            message: 'Subscriber saved and synced to SendGrid',
            data: {
              subscriberDocumentId: subscriber.documentId,
              email: subscriber.Email,
              storeDocumentId,
              listDocumentId: targetList.documentId,
              sync_status: 'synced',
              sendgrid_sync: {
                success: true,
                sendgrid_list_id: syncResult?.data?.sendgrid_list_id,
                sendgrid_contact_id: syncResult?.data?.sendgrid_contact_id,
                jobId: syncResult?.data?.jobId || null
              }
            }
          };
        }

        queueAsyncSyncRetry();

        return {
          success: true,
          message: 'Subscriber saved, SendGrid sync failed, retry queued',
          data: {
            subscriberDocumentId: subscriber.documentId,
            email: subscriber.Email,
            storeDocumentId,
            listDocumentId: targetList.documentId,
            sync_status: 'failed',
            sendgrid_sync: {
              success: false,
              error: syncResult?.error || syncResult?.message || 'sync_failed',
              retry_queued: true
            }
          }
        };
      } catch (error: any) {
        queueAsyncSyncRetry();

        return {
          success: true,
          message: 'Subscriber saved, immediate SendGrid sync failed unexpectedly, retry queued',
          data: {
            subscriberDocumentId: subscriber.documentId,
            email: subscriber.Email,
            storeDocumentId,
            listDocumentId: targetList.documentId,
            sync_status: 'pending',
            sendgrid_sync: {
              success: false,
              error: error?.message || 'unexpected_sync_error',
              retry_queued: true
            }
          }
        };
      }
    }

    queueAsyncSyncRetry();

    return {
      success: true,
      message: 'Subscriber saved and sync queued',
      data: {
        subscriberDocumentId: subscriber.documentId,
        email: subscriber.Email,
        storeDocumentId,
        listDocumentId: targetList.documentId,
        sync_status: 'pending'
      }
    };
  },

  async syncSubscriberToSendGrid(input: TriggerSubscriberResyncInput) {
    const subscriberDocuments = strapi.documents('api::subscriber.subscriber') as any;
    const listDocuments = (strapi.documents as any)('api::subscriber.subscriber-list');
    const membershipDocuments = (strapi.documents as any)('api::subscriber.subscriber-list-membership');

    const subscriberDocumentId = String(input?.subscriberDocumentId || '').trim();
    const storeDocumentId = String(input?.storeDocumentId || '').trim();

    if (!subscriberDocumentId || !storeDocumentId) {
      return {
        success: false,
        message: 'subscriberDocumentId and storeDocumentId are required',
        error: 'missing_required_fields'
      };
    }

    const subscriber = await subscriberDocuments.findOne({
      documentId: subscriberDocumentId,
      populate: ['stores', 'lists']
    }) as any;

    if (!subscriber) {
      return {
        success: false,
        message: 'Subscriber not found',
        error: 'subscriber_not_found'
      };
    }

    const lists = await listDocuments.findMany({
      filters: {
        store: { documentId: { $eq: storeDocumentId } },
        is_default: { $eq: true },
        active: { $eq: true }
      },
      limit: 1,
      populate: ['store']
    }) as any[];

    const targetList = lists?.[0];
    if (!targetList) {
      return {
        success: false,
        message: 'Default subscriber list not found for store',
        error: 'store_default_list_not_found'
      };
    }

    const extension = await findSendGridExtensionForStore(strapi, storeDocumentId);
    const credentials = resolveSendGridCredentialsForNewsletter(extension);

    if (!credentials) {
      await subscriberDocuments.update({
        documentId: subscriberDocumentId,
        data: {
          sync_status: 'failed',
          last_synced_at: new Date().toISOString()
        },
        status: 'published'
      });

      return {
        success: false,
        message: 'SendGrid credentials not configured (env or extension)',
        error: 'missing_sendgrid_credentials'
      };
    }

    const ensuredList = await ensureStoreDefaultSendGridList({
      credentials,
      storeDocumentId,
      existingListId: targetList.sendgrid_list_id || undefined
    });

    if (!ensuredList.success || !ensuredList.listId) {
      await subscriberDocuments.update({
        documentId: subscriberDocumentId,
        data: {
          sync_status: 'failed',
          last_synced_at: new Date().toISOString()
        },
        status: 'published'
      });

      return {
        success: false,
        message: 'Failed to ensure SendGrid list',
        error: ensuredList.error || 'ensure_list_failed'
      };
    }

    await listDocuments.update({
      documentId: targetList.documentId,
      data: {
        sendgrid_list_id: ensuredList.listId,
        sendgrid_list_name: ensuredList.listName,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString()
      },
      status: 'published'
    });

    const upsert = await upsertContactToList({
      credentials,
      listId: ensuredList.listId,
      email: normalizeEmail(subscriber.Email)
    });

    if (upsert.success) {
      try {
        const store = await (strapi.documents('api::store.store') as any).findOne({
          documentId: storeDocumentId,
          populate: ['Favicon', 'settings']
        });

        const shouldSendWelcome = isWelcomeEmailEnabled(store);
        if (!shouldSendWelcome) {
          console.log('[SUBSCRIBER_SYNC] welcome email skipped by store setting', {
            storeDocumentId,
            subscriberDocumentId
          });
        } else {
          const supportEmail = process.env.SENDGRID_REPLY_TO_EMAIL || 'support@markket.place';
          const replyToEmail = store?.settings?.reply_to_email || supportEmail;

          const welcomeHtml = buildWelcomeEmailHtml({
            storeName: store?.title || 'Markkët',
            storeDomain: store?.settings?.domain || 'https://markket.place',
            storeLogoUrl: store?.Favicon?.url,
            welcomeMessage: store?.settings?.welcome_email_text || 'Thanks for subscribing.',
            supportEmail,
            unsubscribeUrl: `https://markket.place/${store?.slug || ''}/subscription?code=${subscriberDocumentId}`,
          });

          const welcomeResult = await sendWelcomeEmail({
            credentials,
            toEmail: normalizeEmail(subscriber.Email),
            subject: `Welcome to ${store?.title || 'Markkët'}`,
            htmlContent: welcomeHtml,
            fromEmail: extension?.config?.from_email,
            fromName: extension?.config?.from_name,
            senderId: extension?.config?.sender_id,
            replyToEmail
          });

          if (!welcomeResult.success) {
            console.warn('[SUBSCRIBER_SYNC] welcome email send failed (non-blocking)', {
              storeDocumentId,
              subscriberDocumentId,
              toEmail: normalizeEmail(subscriber.Email),
              error: welcomeResult.error
            });
          } else {
            console.log('[SUBSCRIBER_SYNC] welcome email accepted', {
              storeDocumentId,
              subscriberDocumentId,
              toEmail: normalizeEmail(subscriber.Email),
              messageId: welcomeResult.messageId || null
            });
          }
        }
      } catch (error: any) {
        console.warn('[SUBSCRIBER_SYNC] welcome email skipped:', error.message);
      }
    }

    const membershipRows = await membershipDocuments.findMany({
      filters: {
        subscriber: { documentId: { $eq: subscriberDocumentId } },
        list: { documentId: { $eq: targetList.documentId } }
      },
      limit: 1
    }) as any[];

    const syncedAt = new Date().toISOString();
    const syncStatus = upsert.success ? 'synced' : 'failed';

    await subscriberDocuments.update({
      documentId: subscriberDocumentId,
      data: {
        sync_status: syncStatus,
        sendgrid_contact_id: upsert.contactId || subscriber.sendgrid_contact_id || null,
        sendgrid_list_ids: upsert.success
          ? Array.from(new Set([...(subscriber.sendgrid_list_ids || []), ensuredList.listId]))
          : (subscriber.sendgrid_list_ids || []),
        last_synced_at: syncedAt
      },
      status: 'published'
    });

    if (membershipRows?.length) {
      await membershipDocuments.update({
        documentId: membershipRows[0].documentId,
        data: {
          status: upsert.success ? 'subscribed' : 'invalid',
          sendgrid_contact_id: upsert.contactId || membershipRows[0].sendgrid_contact_id || null,
          last_synced_at: syncedAt
        }
      });
    }

    return {
      success: upsert.success,
      message: upsert.success ? 'Subscriber synced to SendGrid' : 'Subscriber sync failed',
      data: {
        subscriberDocumentId,
        storeDocumentId,
        listDocumentId: targetList.documentId,
        sendgrid_list_id: ensuredList.listId,
        sendgrid_contact_id: upsert.contactId,
        sync_status: syncStatus,
        jobId: upsert.jobId
      },
      error: upsert.error
    };
  },

  async unsubscribeFromStore(input: { email: string; storeDocumentId: string }) {
    const subscriberDocuments = strapi.documents('api::subscriber.subscriber') as any;
    const membershipDocuments = (strapi.documents as any)('api::subscriber.subscriber-list-membership');
    const listDocuments = (strapi.documents as any)('api::subscriber.subscriber-list');

    const email = normalizeEmail(input?.email);
    const storeDocumentId = String(input?.storeDocumentId || '').trim();

    if (!email || !storeDocumentId) {
      return { success: false, message: 'email and storeDocumentId are required', error: 'missing_required_fields' };
    }

    const existing = await subscriberDocuments.findMany({
      filters: { Email: { $eqi: email } },
      populate: ['stores'],
      limit: 1,
    }) as any[];

    const subscriber = existing?.[0];
    if (!subscriber) {
      // Treat as success — nothing to unsubscribe.
      return { success: true, message: 'No subscription found', data: { email, storeDocumentId } };
    }

    const now = new Date().toISOString();
    const remainingStoreIds = (subscriber.stores || [])
      .map((s: any) => s.documentId)
      .filter((id: string) => id && id !== storeDocumentId);

    await subscriberDocuments.update({
      documentId: subscriber.documentId,
      data: {
        stores: remainingStoreIds,
        sync_status: remainingStoreIds.length === 0 ? 'unsubscribed' : subscriber.sync_status,
        unsubscribed_at: now,
        active: remainingStoreIds.length > 0,
      },
      status: 'published',
    });

    // Mark all memberships for this store's lists as unsubscribed.
    const storeLists = await listDocuments.findMany({
      filters: { store: { documentId: { $eq: storeDocumentId } } },
      limit: 100,
    }) as any[];

    if (storeLists.length > 0) {
      const listIds = storeLists.map((l: any) => l.documentId).filter(Boolean);
      const memberships = await membershipDocuments.findMany({
        filters: {
          subscriber: { documentId: { $eq: subscriber.documentId } },
          list: { documentId: { $in: listIds } },
          status: { $ne: 'unsubscribed' },
        },
        limit: 200,
      }) as any[];

      for (const membership of memberships) {
        await membershipDocuments.update({
          documentId: membership.documentId,
          data: { status: 'unsubscribed', unsubscribed_at: now, unsubscribe_reason: 'user_request' },
        });
      }
    }

    // Best-effort SendGrid removal — fire and forget, no credential errors surface to client.
    setImmediate(async () => {
      try {
        const extension = await findSendGridExtensionForStore(strapi, storeDocumentId);
        const credentials = resolveSendGridCredentialsForNewsletter(extension);
        if (!credentials) return;

        const apiKey = credentials.use_default
          ? process.env.SENDGRID_API_KEY
          : credentials.api_key;
        if (!apiKey) return;

        // Find contact ID in SendGrid by email and remove from all store lists.
        const searchRes = await fetch(
          `https://api.sendgrid.com/v3/marketing/contacts/search/emails`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: [email] }),
          }
        );
        if (!searchRes.ok) return;
        const searchData = await searchRes.json() as any;
        const contactId = searchData?.result?.[email]?.contact?.id;
        if (!contactId) return;

        const listDocumentsInner = (strapi.documents as any)('api::subscriber.subscriber-list');
        const storeListsInner = await listDocumentsInner.findMany({
          filters: { store: { documentId: { $eq: storeDocumentId } }, sendgrid_list_id: { $notNull: true } },
          limit: 50,
        }) as any[];

        for (const list of storeListsInner) {
          if (!list.sendgrid_list_id) continue;
          await fetch(
            `https://api.sendgrid.com/v3/marketing/lists/${list.sendgrid_list_id}/contacts?contact_ids=${contactId}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } }
          );
        }

        console.log('[SUBSCRIBER_UNSUB] SendGrid removal complete', { email, storeDocumentId });
      } catch (err: any) {
        console.warn('[SUBSCRIBER_UNSUB] SendGrid removal failed (non-blocking):', err.message);
      }
    });

    return {
      success: true,
      message: 'Unsubscribed successfully',
      data: { email, storeDocumentId, unsubscribed_at: now },
    };
  },

  async getSubscriberSyncStatus(subscriberDocumentId: string) {
    const subscriberDocuments = strapi.documents('api::subscriber.subscriber') as any;
    const membershipDocuments = (strapi.documents as any)('api::subscriber.subscriber-list-membership');

    const documentId = String(subscriberDocumentId || '').trim();

    if (!documentId) {
      return {
        success: false,
        message: 'subscriberDocumentId is required',
        error: 'missing_required_fields'
      };
    }

    const subscriber = await subscriberDocuments.findOne({
      documentId,
      populate: ['stores', 'lists']
    }) as any;

    if (!subscriber) {
      return {
        success: false,
        message: 'Subscriber not found',
        error: 'subscriber_not_found'
      };
    }

    const memberships = await membershipDocuments.findMany({
      filters: {
        subscriber: { documentId: { $eq: documentId } }
      },
      populate: ['list']
    }) as any[];

    return {
      success: true,
      data: {
        subscriber: {
          documentId: subscriber.documentId,
          email: subscriber.Email,
          sync_status: subscriber.sync_status,
          sendgrid_contact_id: subscriber.sendgrid_contact_id,
          sendgrid_list_ids: subscriber.sendgrid_list_ids || [],
          last_synced_at: subscriber.last_synced_at
        },
        memberships: memberships.map((membership) => ({
          documentId: membership.documentId,
          status: membership.status,
          subscribed_at: membership.subscribed_at,
          unsubscribed_at: membership.unsubscribed_at,
          sendgrid_contact_id: membership.sendgrid_contact_id,
          last_synced_at: membership.last_synced_at,
          list: membership.list ? {
            documentId: membership.list.documentId,
            name: membership.list.name,
            sendgrid_list_id: membership.list.sendgrid_list_id
          } : null
        }))
      }
    };
  }
}));

/**
 * TODO(newsletter-phase-1): Planned service methods (to implement)
 * - subscribeAndQueueSync(input)
 * - getSubscriberSyncStatus(subscriberDocumentId)
 * - triggerSubscriberResync(subscriberDocumentId, options)
 * - syncSubscriberToSendGrid(subscriberDocumentId, options)
 */
