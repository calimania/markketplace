/**
 * Auth magic with email/SMS/WhatsApp links
 *
 * Uses store.settings records for customization and shortener for SMS-friendly links
 */
import { enrollStoreOwnerContact } from '../../../services/sendgrid-marketing';

export default ({ strapi }) => ({
  async preview(ctx) {
    const { code } = ctx.request.body || {};

    if (!code) {
      return ctx.badRequest('CODE_REQUIRED');
    }

    const result = await strapi.service('api::auth-magic.auth-magic').previewCode(code);
    return ctx.send(result);
  },

  async confirm(ctx) {
    const { code } = ctx.request.body || {};

    if (!code) {
      return ctx.badRequest('CODE_REQUIRED');
    }

    const actor = ctx.state.user
      ? {
        id: ctx.state.user.id,
        email: ctx.state.user.email,
        username: ctx.state.user.username,
      }
      : null;

    const result = await strapi.service('api::auth-magic.auth-magic').confirmCodeAction(code, actor);
    return ctx.send(result);
  },

  async request(ctx) {
    const { email, phone, store_id, channel } = ctx.request.body;
    let finalChannel = channel;

    console.log('Auth_magic:request:', { email, phone, store_id, channel });
    if (!finalChannel) {
      finalChannel = 'email';
      if (phone) {
        finalChannel = await strapi.service('api::auth-magic.auth-magic').getUserPreferredChannel(phone);
      }
    }

    console.log('Final channel:', finalChannel);
    if (finalChannel === 'email' && !email) {
      return ctx.badRequest('Email required for email channel');
    }

    if ((finalChannel === 'sms' || finalChannel === 'whatsapp') && !phone) {
      return ctx.badRequest('Phone required for SMS/WhatsApp channel');
    }

    if (!['email', 'sms', 'whatsapp'].includes(finalChannel)) {
      return ctx.badRequest('Invalid channel. Use: email, sms, or whatsapp');
    }

    try {
      const identifier = email || phone;
      const clientIP = ctx.request.ip ||
        ctx.request.header['x-forwarded-for'] ||
        ctx.request.header['x-real-ip'] ||
        ctx.request.connection?.remoteAddress;
      const userAgent = ctx.request.header['user-agent'] || 'Unknown';
      const codeData = await strapi.service('api::auth-magic.auth-magic').generateCode(
        identifier,
        store_id,
        finalChannel,
        clientIP,
        userAgent
      );

      const store = await strapi.service('api::store.store').findOne(store_id, {
        populate: ['Favicon', 'settings']
      });

      if (finalChannel === 'email') {
        await strapi.service('api::auth-magic.auth-magic').sendMagicLink(email, codeData, store);
      } else if (finalChannel === 'sms') {
        await strapi.service('api::auth-magic.auth-magic').sendMagicSMS(phone, codeData, store);
      } else if (finalChannel === 'whatsapp') {
        await strapi.service('api::auth-magic.auth-magic').sendMagicWhatsApp(phone, codeData, store);
      }

      ctx.send({
        ok: true,
        channel: finalChannel,
        domain: store?.settings?.domain,
        message: `Magic link sent via ${finalChannel}`,
        // Backwards compatibility response format
        ...(finalChannel === 'email' && { domain: store?.settings?.domain })
      });

    } catch (error) {
      console.error('Error:magic_link:', error);
      console.error('Error_details:', {
        message: error.message,
        stack: error.stack,
        phone,
        finalChannel,
        store_id
      });
      return ctx.internalServerError('Failed to send magic link');
    }
  },

  async verify(ctx) {
    const { code } = ctx.request.body;

    if (!code) return ctx.badRequest('CODE_REQUIRED');

    try {
      // Track the verification attempt
      const magic = await strapi.service('api::auth-magic.auth-magic').verifyCode(
        code,
        ctx.request.ip,
        ctx.request.header['user-agent']
      );

      if (!magic) return ctx.unauthorized('INVALID_CODE');

      // Extract clean identifier for user lookup
      let cleanIdentifier = magic.email;
      if (magic.phone) {
        // Remove prefixes for user lookup (store clean phone number)
        cleanIdentifier = magic.phone.replace(/^(whatsapp:|sms:)/, '');
      }

      let user;

      if (magic.email) {
        // Email-based lookup
        user = await strapi.query('plugin::users-permissions.user').findOne({
          where: { email: magic.email }
        });
      } else if (magic.phone) {
        // Phone-based lookup - try both prefixed and clean phone
        user = await strapi.query('plugin::users-permissions.user').findOne({
          where: {
            $or: [
              { username: magic.phone }, // Prefixed version
              { username: cleanIdentifier } // Clean version
            ]
          }
        });
      }

      if (user && !user.confirmed) {
        user = await strapi.query('plugin::users-permissions.user').update({
          where: { id: user.id },
          data: { confirmed: true },
        });
        console.info('[AUTH_MAGIC] user auto-confirmed after magic verify', { userId: user.id, purpose: magic.purpose });
      }

      // Create user if doesn't exist
      if (!user && cleanIdentifier) {
        const preferredRoleName = 'Store Owners';
        let role = await strapi.db.query('plugin::users-permissions.role').findOne({
          where: { name: preferredRoleName },
        });

        if (!role) {
          const fallbackRoleName = 'Authenticated';
          role = await strapi.db.query('plugin::users-permissions.role').findOne({
            where: { name: fallbackRoleName },
          });
        }

        if (!role) {
          throw new Error('No users-permissions role found for magic-auth user');
        }

        const userData = {
          username: cleanIdentifier, // Use clean identifier for username
          confirmed: true,
          role: role.id,
          ...(magic.email && { email: magic.email })
        };

        user = await strapi.query('plugin::users-permissions.user').create({
          data: userData
        });

        console.info('new:user', { id: user.id, role: role.id, channel: magic.channel });

        // Enroll new user in platform store owners list (non-fatal)
        if (magic.email) {
          enrollStoreOwnerContact({
            email: magic.email,
            storeDocumentId: magic.store?.documentId || magic.store_id || 'platform',
          }).catch((err: any) => {
            console.warn('[AUTH_MAGIC] owner enrollment skipped:', err?.message);
          });
        }

        // Send welcome message based on channel
        if (magic.channel === 'email') {
          await strapi.service('api::auth-magic.auth-magic').welcomeEmail(magic.email, magic.store);
        } else {
          await strapi.service('api::auth-magic.auth-magic').welcomeSMS(cleanIdentifier, magic.store);
        }
      }

      if (user && magic.purpose === 'store_invite') {
        const storeOwnersRole = await strapi.db.query('plugin::users-permissions.role').findOne({
          where: { name: 'Store Owners' },
        });

        const currentRoleRaw = (user as any)?.role;
        const currentRoleId = Number((user as any)?.role?.id || currentRoleRaw || 0);
        const currentRoleName = typeof currentRoleRaw === 'object' ? String(currentRoleRaw?.name || '') : '';

        if (storeOwnersRole && currentRoleId !== Number(storeOwnersRole.id)) {
          user = await strapi.query('plugin::users-permissions.user').update({
            where: { id: user.id },
            data: { role: storeOwnersRole.id },
          });
          console.info('[AUTH_MAGIC] user role corrected for store invite', {
            userId: user.id,
            previousRoleId: currentRoleId || null,
            previousRoleName: currentRoleName || null,
            roleId: storeOwnersRole.id,
            roleName: storeOwnersRole.name || 'Store Owners',
          });
        }
      }

      const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

      // Handle store_invite: connect the verified user to the invited store
      if (magic.purpose === 'store_invite') {
        if (!magic.meta?.storeDocumentId) {
          console.warn('[AUTH_MAGIC] store_invite: missing storeDocumentId in meta', { meta: magic.meta });
        }
      }
      if (magic.purpose === 'store_invite' && magic.meta?.storeDocumentId) {
        const storeDocumentId = String(magic.meta.storeDocumentId);
        console.info('[AUTH_MAGIC] store_invite: processing', { storeDocumentId, userId: user.id, meta: magic.meta });
        try {
          const store = await strapi.documents('api::store.store').findOne({
            documentId: storeDocumentId,
            populate: ['users', 'owner'],
          }) as any;

          console.info('[AUTH_MAGIC] store_invite: store found', { found: !!store, userCount: store?.users?.length });

          if (store) {
            const alreadyMember = store.users?.some((u: any) => Number(u.id) === Number(user.id));
            console.info('[AUTH_MAGIC] store_invite: alreadyMember', { alreadyMember, userId: user.id });
            if (!alreadyMember) {
              let updateResult: any = null;
              try {
                updateResult = await strapi.documents('api::store.store').update({
                  documentId: storeDocumentId,
                  data: { users: { connect: [{ id: user.id }] } } as any,
                });
              } catch (primaryConnectErr: any) {
                console.warn('[AUTH_MAGIC] store_invite: primary connect shape failed', {
                  storeDocumentId,
                  userId: user.id,
                  error: primaryConnectErr?.message,
                });
                updateResult = await strapi.documents('api::store.store').update({
                  documentId: storeDocumentId,
                  data: { users: { connect: [user.id] } } as any,
                });
              }

              const verifyStore = await strapi.documents('api::store.store').findOne({
                documentId: storeDocumentId,
                populate: ['users'],
              }) as any;
              const linked = Array.isArray(verifyStore?.users)
                ? verifyStore.users.some((u: any) => Number(u?.id) === Number(user.id))
                : false;

              console.info('[AUTH_MAGIC] store_invite: user connected to store', {
                userId: user.id,
                storeDocumentId,
                updateOk: !!updateResult,
                linked,
                resultingUserCount: verifyStore?.users?.length || 0,
              });
            }

            const existingMembership = await strapi.documents('api::store-membership.store-membership').findMany({
              filters: {
                store: { documentId: storeDocumentId },
                user: { id: user.id },
              } as any,
              limit: 1,
            }) as any[];

            if (!existingMembership?.length) {
              await strapi.documents('api::store-membership.store-membership').create({
                data: {
                  store: storeDocumentId,
                  user: user.id,
                  role: Number(store.owner?.id) === Number(user.id) ? 'owner' : 'editor',
                  status: 'active',
                  invited_by: Number(magic.meta?.invitedByUserId) || undefined,
                  joined_at: new Date().toISOString(),
                } as any,
              });
            }

            strapi.documents('api::markket.markket').create({
              data: {
                Key: 'invite.accepted',
                EventType: 'invite',
                EventSubType: 'accepted',
                Source: 'auth-magic.verify',
                ReceivedAt: new Date().toISOString(),
                user_key_or_id: String(user.id),
                Content: {
                  storeDocumentId,
                  storeSlug: store.slug,
                  inviteeEmail: magic.email || null,
                  inviteeUserId: user.id,
                  alreadyMember,
                },
              },
            } as any).catch((err: any) => {
              console.warn('[AUTH_MAGIC] invite.accepted audit log failed (non-fatal):', err?.message);
            });

            // Send welcome email to the new member (invite accepted flow)
            if (magic.email) {
              const { buildInviteAcceptedEmailHtml } = await import('../../../services/sendgrid-email-templates');
              const html = buildInviteAcceptedEmailHtml({
                memberName: user.username || user.email,
                storeName: store.title || store.slug || storeDocumentId,
                storeSlug: store.slug,
                invitedByName: magic.meta?.invitedByName as string | undefined,
              });
              await strapi.plugin('email').service('email').send({
                to: magic.email,
                subject: `You've joined ${store.title || 'a store'} on Markketplace`,
                html,
              });
            }
          }
        } catch (inviteErr: any) {
          console.error('[AUTH_MAGIC] store_invite side-effect failed:', inviteErr?.message);
          // Non-fatal — user still gets their JWT
        }
      }

      ctx.send({
        jwt,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          confirmed: user.confirmed
        },
        channel: magic.channel
      });

    } catch (error) {
      console.error('Error verifying magic code:', error);
      return ctx.internalServerError('Failed to verify code');
    }
  }
});
