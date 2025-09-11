/**
 * Auth magic with email/SMS/WhatsApp links
 *
 * Uses store.settings records for customization and shortener for SMS-friendly links
 */
export default ({ strapi }) => ({
  async request(ctx) {
    const { email, phone, store_id, channel } = ctx.request.body;

    // Auto-detect preferred channel if not specified
    let finalChannel = channel;

    if (!finalChannel) {
      if (email && !phone) {
        finalChannel = 'email';
      } else if (phone) {
        // Get user's preferred channel for this phone number
        finalChannel = await strapi.service('api::auth-magic.auth-magic').getUserPreferredChannel(phone);
      } else {
        finalChannel = 'email'; // Default fallback
      }
    }

    // Validate input based on channel
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

      // Extract IP and User-Agent from request (automatically available from AJAX)
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

      // Send the magic link via the specified channel
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
      console.error('Error sending magic link:', error);
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

      // Create user if doesn't exist
      if (!user && cleanIdentifier) {
        const role = await strapi.db.query('plugin::users-permissions.role').findOne({
          where: { name: 'Store Owners' },
        });

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

        // Send welcome message based on channel
        if (magic.channel === 'email') {
          await strapi.service('api::auth-magic.auth-magic').welcomeEmail(magic.email, magic.store);
        } else {
          await strapi.service('api::auth-magic.auth-magic').welcomeSMS(cleanIdentifier, magic.store);
        }
      }

      const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

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
