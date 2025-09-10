import crypto from 'crypto';
import { AccountCreatedHTML , MagicLinkHTML} from './email.template';
import { generateRandomSlug } from '../../shortner/services/slug-generator';

// Initialize Twilio client if configured
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SENDER = process.env.TWILIO_SENDER
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const TWILIO_TEMPLATE_ID_MAGIC_LINK = process.env.TWILIO_TEMPLATE_ID_MAGIC_LINK; // WhatsApp magic link template

let twilioClient = null;

if (TWILIO_AUTH_TOKEN) {
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_AUTH_TOKEN?.split(':')[0];

  if (!TWILIO_ACCOUNT_SID) {
    console.warn('TWILIO_ACCOUNT_SID not found');

  } else {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      console.log('Twilio client initializing');

      if (TWILIO_MESSAGING_SERVICE_SID) {
        console.log('Twilio Messaging Service:', TWILIO_MESSAGING_SERVICE_SID);
      } else if (TWILIO_SENDER) {
        console.log('Using Twilio Phone Number:', TWILIO_SENDER);
      }
    } catch (error) {
      console.error('Twilio failed to initialize:', error);
    }
  }
}

/**
 * Creates a unique code to identify a user connection to an email/phone
 * Integrates with shortener for SMS-friendly links
 * Supports multiple channels: email, SMS, WhatsApp
 */
export default ({ strapi }) => ({
  async generateCode(identifier: string, store_id?: string, channel = 'email', ipAddress?: string, userAgent?: string) {
    const code = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    // Prepare data based on channel
    const data: any = {
      code,
      expiresAt,
      channel,
      ipAddress,
      userAgent,
      store: store_id
    };

    if (channel === 'email') {
      data.email = identifier;
    } else {
      // For SMS and WhatsApp, store with prefix for Twilio compatibility
      const phoneWithPrefix = channel === 'whatsapp' ? `whatsapp:${identifier}` : identifier;
      data.phone = phoneWithPrefix;
    }

    // For SMS/WhatsApp, create a shortener link
    if (channel === 'sms' || channel === 'whatsapp') {
      const store = store_id ? await strapi.entityService.findOne('api::store.store', store_id, {
        populate: ['settings']
      }) : null;

      const baseUrl = store?.settings?.domain || 'https://de.markket.place';
      const magicUrl = `${baseUrl}/auth/magic?code=${code}`;

      // Generate a unique alias for the short URL
      let alias = generateRandomSlug();

      // Check for collision (very unlikely but possible)
      let attempts = 0;
      while (attempts < 5) {
        const existing = await strapi.entityService.findMany('api::shortner.shortner', {
          filters: { alias },
          limit: 1
        });

        if (!existing || existing.length === 0) break;

        alias = generateRandomSlug();
        attempts++;
      }

      if (attempts >= 5) {
        throw new Error('Failed to generate unique alias for magic link');
      }

      // Create a short URL for the magic link
      const shortner = await strapi.entityService.create('api::shortner.shortner', {
        data: {
          alias,
          url: magicUrl,
          title: `Magic login for ${identifier}`,
          description: `${channel.toUpperCase()} magic auth link`,
          visit: 0
        }
      });

      data.shortner = shortner.id;
    }

    const magicCode = await strapi.entityService.create('api::auth-magic.magic-code', {
      data
    });

    return { code, shortner: data.shortner, attempts: magicCode?.attempts };
  },

  /**
   * Send magic link via email
   */
  async sendMagicLink(email: string, codeData: any, store: any) {
    const { code } = codeData;
    const url = new URL(`/auth/magic?code=${code}`, store?.settings?.domain || 'https://de.markket.place')?.toString() || '';
    const subject = `${store?.title || 'Markkët'} Magic Login Link`

    await strapi.plugin('email').service('email').send({
      to: email,
      subject,
      text: `Click to login: ${url}`,
      html: MagicLinkHTML(email, url, store),
    });
  },

  /**
   * Send magic link via phone (SMS or WhatsApp) using unified Twilio handler
   */
  async sendMagicPhone(phone: string, codeData: any, store: any, channel: 'sms' | 'whatsapp') {
    const { code, shortner } = codeData;

    if (!shortner) {
      throw new Error('Short URL not created for phone magic link');
    }

    const shortnerRecord = await strapi.entityService.findOne('api::shortner.shortner', shortner);
    const baseUrl = process.env.MARKKET_API_URL || 'https://api.markket.place';
    const shortUrl = `${baseUrl}/s/${shortnerRecord.alias}`;
    const message = `${store?.title || 'Markkët'} login link: ${shortUrl}`;

    const twilioDestination = channel === 'whatsapp' ? `whatsapp:${phone}` : phone;
    console.log(`${channel.toUpperCase()}_requested: to_${twilioDestination}:_${message}`);

    try {
      if (!twilioClient) {
        console.warn('missing:TWILIO_AUTH_TOKEN');
        return { shortUrl, destination: twilioDestination, sent: false };
      }

      let twilioMessage;
      if (channel === 'whatsapp' && TWILIO_TEMPLATE_ID_MAGIC_LINK) {
        console.log('whatsapp_template:', TWILIO_TEMPLATE_ID_MAGIC_LINK);

        twilioMessage = await twilioClient.messages.create({
          contentSid: TWILIO_TEMPLATE_ID_MAGIC_LINK,
          contentVariables: JSON.stringify({
            "1": store?.title || 'Markkët',  // App name
            "2": shortUrl                    // Short URL
          }),
          from: TWILIO_MESSAGING_SERVICE_SID || `whatsapp:${TWILIO_SENDER}`,
          to: twilioDestination
        });
      } else if (channel === 'whatsapp') {
        // WhatsApp without template = not supported
        console.warn('WhatsApp requires approved templates.');
        throw new Error('WhatsApp requires approved templates. Please use SMS instead or set up WhatsApp template.');
      } else {
        const message = `🔗 ${store?.title || 'Markkët'} login\n\nCode: ${code}\nLink: ${shortUrl}\n\nExpires in 15min`;

        const messageParams: any = {
          body: message,
          to: twilioDestination
        };

        // Use Messaging Service SID if available, otherwise use phone number
        if (TWILIO_MESSAGING_SERVICE_SID || TWILIO_SENDER) {
          messageParams.from = TWILIO_MESSAGING_SERVICE_SID || TWILIO_SENDER;
        } else {
          throw new Error('Either TWILIO_MESSAGING_SERVICE_SID or TWILIO_SENDER must be configured');
        }

        twilioMessage = await twilioClient.messages.create(messageParams);
      } console.log(`${channel.toUpperCase()}_sent: ${twilioMessage.sid}`);

      return {
        shortUrl,
        message,
        destination: twilioDestination,
        sent: true,
        messageSid: twilioMessage.sid,
        status: twilioMessage.status
      };

    } catch (error) {
      console.error(`${channel.toUpperCase()}_failed:`, error);

      // Return the details even if sending failed, for debugging
      return {
        shortUrl,
        message,
        destination: twilioDestination,
        sent: false,
        error: error.message
      };
    }
  },

  // Legacy method names for backwards compatibility
  async sendMagicSMS(phone: string, codeData: any, store: any) {
    return this.sendMagicPhone(phone, codeData, store, 'sms');
  },

  async sendMagicWhatsApp(phone: string, codeData: any, store: any) {
    return this.sendMagicPhone(phone, codeData, store, 'whatsapp');
  },  /**
   * Verify magic code with attempt tracking and security
   */
  async verifyCode(code: string, ipAddress?: string, userAgent?: string) {
    const record = await strapi.entityService.findMany('api::auth-magic.magic-code', {
      filters: { code, used: false },
      sort: { createdAt: 'desc' },
      limit: 1,
      populate: ['store.settings', 'store', 'store.Favicon', 'shortner']
    });

    if (!record.length) return null;

    const magic = record[0];

    // Check if expired
    if (new Date(magic.expiresAt) < new Date()) {
      await strapi.entityService.update('api::auth-magic.magic-code', magic.id, {
        data: { used: true } // Mark as used to prevent reuse
      });
      return null;
    }

    // Check attempt limits
    if (magic.attempts >= magic.maxAttempts) {
      console.warn(`🚨 Magic code attempt limit exceeded: ${magic.email || magic.phone}`);
      return null;
    }

    // Increment attempts
    await strapi.entityService.update('api::auth-magic.magic-code', magic.id, {
      data: {
        attempts: magic.attempts + 1,
        used: true // Mark as used on successful verification
      }
    });

    // Log security info
    console.log(`🔐 Magic code verified: ${magic.email || magic.phone} (${magic.channel}) from ${ipAddress}`);

    // If this was a shortener-based link, increment its visit count
    if (magic.shortner) {
      await strapi.entityService.update('api::shortner.shortner', magic.shortner.id, {
        data: { visit: magic.shortner.visit + 1 }
      });
    }

    return magic;
  },

  /**
   * Welcome email for new users
   */
  async welcomeEmail(email: string, store: any) {
    await strapi.plugin('email').service('email').send({
      to: email,
      subject: `Welcome to ${store?.title || 'Markkët'}`,
      text: `Welcome to ${store?.title || 'Markkët'}`,
      html: AccountCreatedHTML(email, store),
    });

    return {};
  },

  /**
   * Welcome SMS for new users
   */
  async welcomeSMS(phone: string, store: any) {
    const message = `🎉 Welcome to ${store?.title || 'Markkët'}! Your account is ready.`;

    console.log(`📱 Welcome SMS to ${phone}: ${message}`);

    // Send via Twilio
    try {
      if (!twilioClient) {
        console.warn('⚠️ Twilio client not configured for welcome SMS');
        return { message, sent: false };
      }

      if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_SENDER) {
        console.warn('⚠️ Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_SENDER configured');
        return { message, sent: false };
      }

      // Create message parameters
      const messageParams: any = {
        body: message,
        to: phone
      };

      // Use Messaging Service SID if available, otherwise use phone number
      if (TWILIO_MESSAGING_SERVICE_SID) {
        messageParams.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
      } else {
        messageParams.from = TWILIO_SENDER;
      }

      const twilioMessage = await twilioClient.messages.create(messageParams);

      console.log(`✅ Welcome SMS sent: ${twilioMessage.sid}`);
      return { message, sent: true, messageSid: twilioMessage.sid, status: twilioMessage.status };

    } catch (error) {
      console.error('❌ Failed to send welcome SMS:', error);
      return { message, sent: false, error: error.message };
    }
  }
});
