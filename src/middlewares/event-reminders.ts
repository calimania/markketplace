/**
 * Event reminder document middleware and cron sender.
 *
 * Lifecycle:
 * - On event create / update / publish: upsert one pending reminder record
 *   scheduled for 24h before startDate.
 * - On event unpublish / delete: cancel any pending reminder for that event.
 *
 * Sending:
 * - sendDueEventReminders() is called from the cron task in src/index.ts.
 * - It finds pending reminders due within the next 10-minute window, loads
 *   approved RSVPs for each event, sends individual reminder emails, then
 *   marks the reminder record as sent or failed.
 */

import { EventReminderEmailHtml } from '../api/markket/services/notification/email.template';

const EVENT_UID = 'api::event.event';
const REMINDER_UID = 'api::event-reminder.event-reminder';
const RSVP_UID = 'api::rsvp.rsvp';

const REMINDER_HOURS_BEFORE = 24;
const eventOperationLocks = new Set<string>();
let isReminderCronRunning = false;

async function runWithEventLock(key: string, work: () => Promise<void>): Promise<void> {
  if (eventOperationLocks.has(key)) {
    return;
  }

  eventOperationLocks.add(key);
  try {
    await work();
  } finally {
    eventOperationLocks.delete(key);
  }
}

/** Resolve a SendGrid API key from store extensions or the platform env. */
async function resolveSendGridApiKey(strapi: any, storeDocumentId: string): Promise<string | null> {
  if (process.env.SENDGRID_API_KEY) {
    return process.env.SENDGRID_API_KEY;
  }

  try {
    const store = await (strapi.documents as any)('api::store.store').findOne({
      documentId: storeDocumentId,
      populate: ['extensions'],
    });

    const sgExt = (store?.extensions || []).find(
      (e: any) => e?.active && typeof e?.credentials?.api_key === 'string' && String(e?.key || '').includes('sendgrid')
    );

    if (sgExt?.credentials?.api_key) {
      const { decryptCredentials } = await import('../services/encryption');
      const creds = decryptCredentials(sgExt.credentials);
      return creds?.api_key || null;
    }
  } catch (err: any) {
    console.warn('[EVENT_REMINDER] credential resolution failed:', err.message);
  }

  return null;
}

/** Compute the reminder datetime: startDate minus REMINDER_HOURS_BEFORE hours. */
function computeScheduledFor(startDate: string | null | undefined): Date | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(d.getHours() - REMINDER_HOURS_BEFORE);
  return d;
}

/** Upsert a pending reminder for the given event. Skips if startDate is in the past or missing. */
async function upsertEventReminder(strapi: any, eventDocumentId: string): Promise<void> {
  try {
    const event = await (strapi.documents as any)(EVENT_UID).findOne({
      documentId: eventDocumentId,
      populate: ['stores'],
    });

    if (!event?.startDate) return;

    const scheduledFor = computeScheduledFor(event.startDate);
    if (!scheduledFor || scheduledFor <= new Date()) {
      // Reminder window already passed — nothing to schedule.
      return;
    }

    const storeDocumentId = event?.stores?.[0]?.documentId || null;
    const reminders = (strapi.documents as any)(REMINDER_UID);

    // Find existing pending reminders for this event.
    const existing: any[] = await reminders.findMany({
      filters: {
        event: { documentId: { $eq: eventDocumentId } },
        status: { $in: ['pending'] },
      },
      sort: ['createdAt:asc'],
      limit: 10,
    });

    if (existing.length > 0) {
      // Update the scheduled time in case startDate changed.
      await reminders.update({
        documentId: existing[0].documentId,
        data: {
          scheduled_for: scheduledFor.toISOString(),
          subject: `Reminder: ${event.Name || 'Event'} is tomorrow`,
          ...(storeDocumentId ? { store: storeDocumentId } : {}),
        },
      });

      // Dedupe safety: if race created multiple pending reminders, cancel extras.
      if (existing.length > 1) {
        for (const duplicate of existing.slice(1)) {
          await reminders.update({
            documentId: duplicate.documentId,
            data: {
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              error: 'auto_cancelled_duplicate_pending_reminder',
            },
          });
        }
      }

      console.log('[EVENT_REMINDER] Updated reminder schedule', { eventDocumentId, scheduledFor });
    } else {
      try {
        await reminders.create({
          data: {
            event: eventDocumentId,
            ...(storeDocumentId ? { store: storeDocumentId } : {}),
            scheduled_for: scheduledFor.toISOString(),
            status: 'pending',
            subject: `Reminder: ${event.Name || 'Event'} is tomorrow`,
          },
        });
      } catch (createErr: any) {
        // Race-safe fallback: if create collided with another write, re-read and update.
        const isLikelyUniqueConflict =
          /unique|duplicate|already exists/i.test(String(createErr?.message || ''));

        if (!isLikelyUniqueConflict) {
          throw createErr;
        }

        const fallbackExisting: any[] = await reminders.findMany({
          filters: {
            event: { documentId: { $eq: eventDocumentId } },
            status: { $in: ['pending'] },
          },
          sort: ['createdAt:asc'],
          limit: 1,
        });

        if (fallbackExisting.length > 0) {
          await reminders.update({
            documentId: fallbackExisting[0].documentId,
            data: {
              scheduled_for: scheduledFor.toISOString(),
              subject: `Reminder: ${event.Name || 'Event'} is tomorrow`,
              ...(storeDocumentId ? { store: storeDocumentId } : {}),
            },
          });
        } else {
          throw createErr;
        }
      }

      console.log('[EVENT_REMINDER] Created reminder', { eventDocumentId, scheduledFor });
    }
  } catch (err: any) {
    console.error('[EVENT_REMINDER] upsertEventReminder failed:', err.message);
  }
}

/** Cancel pending reminders for an event (on unpublish / delete). */
async function cancelEventReminders(strapi: any, eventDocumentId: string): Promise<void> {
  try {
    const reminders = (strapi.documents as any)(REMINDER_UID);
    const pending: any[] = await reminders.findMany({
      filters: {
        event: { documentId: { $eq: eventDocumentId } },
        status: { $in: ['pending'] },
      },
      limit: 50,
    });

    for (const reminder of pending) {
      await reminders.update({
        documentId: reminder.documentId,
        data: { status: 'cancelled', cancelled_at: new Date().toISOString() },
      });
    }

    if (pending.length > 0) {
      console.log('[EVENT_REMINDER] Cancelled reminders', { eventDocumentId, count: pending.length });
    }
  } catch (err: any) {
    console.error('[EVENT_REMINDER] cancelEventReminders failed:', err.message);
  }
}

/** Send reminder email to a single RSVP attendee. */
async function sendReminderEmail(
  apiKey: string,
  rsvp: any,
  event: any,
  store: any
): Promise<{ success: boolean; error?: string }> {
  const toEmail = String(rsvp?.email || '').trim().toLowerCase();
  if (!toEmail) return { success: false, error: 'missing email' };

  const html = EventReminderEmailHtml({ event, store });
  const subject = `Reminder: ${event?.Name || 'Your event'} is tomorrow`;

  const fromEmail = store?.settings?.from_email || process.env.SENDGRID_FROM_EMAIL || 'no-reply@markket.place';
  const fromName = store?.title || 'Markkët';

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `SendGrid ${res.status}: ${body.slice(0, 200)}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Find pending reminders due within the next 10 minutes and send them.
 * Called from the cron task registered in src/index.ts.
 */
export async function sendDueEventReminders(strapi: any): Promise<void> {
  if (isReminderCronRunning) {
    console.warn('[EVENT_REMINDER_CRON] Previous run still active, skipping overlap');
    return;
  }

  isReminderCronRunning = true;

  const reminders = (strapi.documents as any)(REMINDER_UID);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 10 * 60 * 1000); // 10-min lookahead

  let due: any[];
  try {
    due = await reminders.findMany({
      filters: {
        status: { $eq: 'pending' },
        scheduled_for: { $lte: windowEnd.toISOString() },
      },
      populate: ['event', 'store'],
      limit: 50,
    });
  } catch (err: any) {
    console.error('[EVENT_REMINDER_CRON] Failed to query due reminders:', err.message);
    isReminderCronRunning = false;
    return;
  }

  if (!due.length) {
    isReminderCronRunning = false;
    return;
  }

  console.log('[EVENT_REMINDER_CRON] Processing reminders', { count: due.length });

  try {
    for (const reminder of due) {
      const latest = await reminders.findOne({ documentId: reminder.documentId });
      if (!latest || latest.status !== 'pending') {
        continue;
      }

      const event = reminder.event;
      const store = reminder.store;

      if (!event?.documentId) {
        await reminders.update({
          documentId: reminder.documentId,
          data: { status: 'failed', error: 'event relation missing', sent_at: now.toISOString() },
        });
        continue;
      }

      const storeDocumentId = store?.documentId || event?.stores?.[0]?.documentId || null;
      const apiKey = storeDocumentId ? await resolveSendGridApiKey(strapi, storeDocumentId) : null;

      if (!apiKey) {
        await reminders.update({
          documentId: reminder.documentId,
          data: { status: 'failed', error: 'no SendGrid API key', sent_at: now.toISOString() },
        });
        console.warn('[EVENT_REMINDER_CRON] No API key for reminder', { reminderId: reminder.documentId });
        continue;
      }

      // Load full store for theme/branding in email.
      let fullStore = store;
      if (storeDocumentId && !store?.settings) {
        try {
          fullStore = await (strapi.documents as any)('api::store.store').findOne({
            documentId: storeDocumentId,
            populate: ['Favicon', 'settings'],
          });
        } catch { /* use partial store */ }
      }

      // Fetch approved RSVPs.
      let rsvps: any[] = [];
      try {
        rsvps = await (strapi.documents as any)(RSVP_UID).findMany({
          filters: {
            event: { documentId: { $eq: event.documentId } },
            approved: { $eq: true },
          },
          limit: 500,
        });
      } catch (err: any) {
        console.error('[EVENT_REMINDER_CRON] Failed to fetch RSVPs:', err.message);
      }

      let sent = 0;
      let failed = 0;

      for (const rsvp of rsvps) {
        const result = await sendReminderEmail(apiKey, rsvp, event, fullStore);
        if (result.success) {
          sent++;
        } else {
          failed++;
          console.warn('[EVENT_REMINDER_CRON] Email failed', { email: rsvp?.email, error: result.error });
        }
      }

      const finalStatus = failed > 0 && sent === 0 ? 'failed' : 'sent';
      await reminders.update({
        documentId: reminder.documentId,
        data: {
          status: finalStatus,
          sent_at: now.toISOString(),
          recipients_count: sent,
          failed_count: failed,
          ...(finalStatus === 'failed' ? { error: `${failed} of ${rsvps.length} failed` } : {}),
        },
      });

      console.log('[EVENT_REMINDER_CRON] Reminder done', {
        reminderId: reminder.documentId,
        eventId: event.documentId,
        sent,
        failed,
        status: finalStatus,
      });
    }
  } finally {
    isReminderCronRunning = false;
  }
}

/**
 * Register the document middleware that watches event lifecycle changes.
 * Call this from bootstrap in src/index.ts.
 */
export function registerEventReminderMiddleware({ strapi }: { strapi: any }): void {
  console.log('[event-reminder]:register');

  strapi.documents.use(async (context: any, next: any) => {
    const result = await next();

    if (context.uid !== EVENT_UID) return result;

    const { action } = context;
    const documentId = result?.documentId || context?.params?.documentId;

    if (!documentId) return result;

    if (['create', 'update', 'publish'].includes(action)) {
      setImmediate(() => {
        void runWithEventLock(`upsert:${documentId}`, () => upsertEventReminder(strapi, documentId));
      });
    } else if (['unpublish', 'delete'].includes(action)) {
      setImmediate(() => {
        void runWithEventLock(`cancel:${documentId}`, () => cancelEventReminders(strapi, documentId));
      });
    }

    return result;
  });
}
