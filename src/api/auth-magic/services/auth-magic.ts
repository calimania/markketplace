import crypto from 'crypto';
import { AccountCreatedHTML , MagicLinkHTML} from './email.template';
import { generateRandomSlug } from '../../shortner/services/slug-generator';

// Initialize Twilio client if configured
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SENDER = process.env.TWILIO_SENDER
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const TWILIO_TEMPLATE_ID_MAGIC_LINK = process.env.TWILIO_TEMPLATE_ID_MAGIC_LINK; // WhatsApp magic link template
const DEFAULT_STORE_SLUG = process.env.MARKKET_STORE_SLUG || 'next';

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
    console.log('generateCode magic link:', { identifier, store_id, channel });

    // Security: Check for rate limiting (prevent spam/abuse)
    await this.checkRateLimit(identifier, ipAddress);

    const code = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    console.log('Generated code and expiration');

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
      // For SMS and WhatsApp, store normalized phone number (same user)
      // The whatsapp: prefix is only used for Twilio API calls
      data.phone = identifier; // Store clean phone number: +1234567890
    }

    console.log('Channel data prepared');

    // For SMS/WhatsApp, create a shortener link
    if (channel === 'sms' || channel === 'whatsapp') {
      console.log('Creating shortener link...');

      let store = null;

      if (store_id) {
        console.log('Fetching store by ID:', store_id);
        store = await strapi.documents('api::store.store').findOne({
          documentId: store_id,
          populate: ['settings', 'SEO']
        });
        console.log('Store found by ID:', !!store);
      }

      // If no store found or no store_id provided, use default store
      if (!store) {
        console.log('Fetching default store by slug:', DEFAULT_STORE_SLUG);
        const stores = await strapi.documents('api::store.store').findMany({
          filters: { slug: DEFAULT_STORE_SLUG },
          populate: ['settings', 'SEO'],
          limit: 1
        });
        store = stores && stores.length > 0 ? stores[0] : null;
        console.log('📊 Default store found:', !!store, stores?.length);
      }

      const baseUrl = store?.settings?.domain || 'https://de.markket.place';
      const magicUrl = `${baseUrl}/auth/magic?code=${code}`;

      console.log('URLs:', { baseUrl, magicUrl });

      // Generate a unique alias for the short URL
      let alias = generateRandomSlug();

      // Check for collision (very unlikely but possible)
      let attempts = 0;
      while (attempts < 5) {
        const existing = await strapi.documents('api::shortner.shortner').findMany({
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

      // Create a short URL for the magic link with store-specific branding
      // Use the store we already fetched (either by store_id or default)
      const storeTitle = store?.title || store?.SEO?.metaTitle || 'Markkët';
      console.log('Creating shortener with:', { alias, magicUrl, storeTitle });

      const shortner = await strapi.documents('api::shortner.shortner').create({
        data: {
          alias,
          url: magicUrl,
          title: `${storeTitle}  Auth`,
          description: `Secure ${channel.toUpperCase()} authentication link for ${storeTitle}`,
          visit: 0,
          store: store?.documentId || store?.id  // Use the store we found
        }
      });

      console.log('Shortener created:', { id: shortner.documentId || shortner.id, alias: shortner.alias });

      data.shortner = shortner.documentId || shortner.id;
      console.log('Shortener ID stored:', data.shortner);
    }

    const magicCode = await strapi.documents('api::auth-magic.magic-code').create({
      data
    });

    // Update user's communication preferences if this is a phone-based channel
    if (channel === 'sms' || channel === 'whatsapp') {
      await this.updateUserChannelPreference(identifier, channel);
    }

    return { code, shortner: data.shortner, attempts: magicCode?.attempts };
  },

  /**
   * Security: Check rate limiting to prevent abuse
   */
  async checkRateLimit(identifier: string, ipAddress?: string) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check identifier rate limit (email/phone)
    const identifierAttempts = await strapi.documents('api::auth-magic.magic-code').findMany({
      filters: {
        $or: [
          { email: identifier },
          { phone: identifier }
        ],
        createdAt: { $gte: oneHourAgo }
      }
    });

    if (identifierAttempts.length >= 5) {
      throw new Error('Rate limit exceeded for this contact. Please wait before requesting another code.');
    }

    // Check IP rate limit (prevent mass attacks)
    if (ipAddress) {
      const ipAttempts = await strapi.documents('api::auth-magic.magic-code').findMany({
        filters: {
          ipAddress,
          createdAt: { $gte: oneHourAgo }
        }
      });

      if (ipAttempts.length >= 10) {
        throw new Error('Rate limit exceeded for this IP address. Please wait before requesting more codes.');
      }
    }
  },

  /**
   * Update user's preferred communication channel
   */
  async updateUserChannelPreference(phone: string, channel: 'sms' | 'whatsapp') {
    try {
      // Find user by phone number
      const users = await strapi.documents('plugin::users-permissions.user').findMany({
        filters: { phone },
        limit: 1
      });

      if (users && users.length > 0) {
        const user = users[0];

        // Update their communication preferences
        await strapi.documents('plugin::users-permissions.user').update({
          documentId: user.documentId,
          data: {
            lastChannelUsed: channel,
            // Only update preferred channel if they don't have one set
            ...((!user.preferredChannel || user.preferredChannel === 'email') && {
              preferredChannel: channel
            })
          }
        });

        console.log(`Updated user ${phone} communication preference: ${channel}`);
      }
    } catch (error) {
      console.warn('Could not update user channel preference:', error.message);
      // Don't fail the magic auth if this fails
    }
  },

  /**
   * Get user's preferred communication channel
   */
  async getUserPreferredChannel(identifier: string): Promise<'email' | 'sms' | 'whatsapp'> {
    try {
      // Try to find user by email first
      let users = await strapi.documents('plugin::users-permissions.user').findMany({
        filters: { email: identifier },
        limit: 1
      });

      // If not found by email, try by phone
      if (!users || users.length === 0) {
        users = await strapi.documents('plugin::users-permissions.user').findMany({
          filters: { phone: identifier },
          limit: 1
        });
      }

      if (users && users.length > 0) {
        const user = users[0];
        return user.preferredChannel || user.lastChannelUsed || 'email';
      }

      // Smart default: if identifier looks like phone, default to SMS
      const isPhone = identifier.startsWith('+') || /^\d+$/.test(identifier);
      return isPhone ? 'sms' : 'email';
    } catch (error) {
      console.warn('Could not get user channel preference:', error.message);
      // Smart fallback based on identifier format
      const isPhone = identifier.startsWith('+') || /^\d+$/.test(identifier);
      return isPhone ? 'sms' : 'email';
    }
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

    console.log('Looking for shortener with ID:', shortner);
    const shortnerRecord = await strapi.documents('api::shortner.shortner').findOne({
      documentId: shortner
    });

    if (!shortnerRecord) {
      console.error('Shortener record not found for ID:', shortner);
      throw new Error(`Shortener record not found for ID: ${shortner}`);
    }

    console.log('Found shortener record:', { alias: shortnerRecord.alias, url: shortnerRecord.url });
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
    const record = await strapi.documents('api::auth-magic.magic-code').findMany({
      filters: { code, used: false },
      sort: { createdAt: 'desc' },
      limit: 1,
      populate: ['store.settings', 'store', 'store.Favicon', 'shortner']
    });

    if (!record.length) return null;

    const magic = record[0];

    // Check if expired
    if (new Date(magic.expiresAt) < new Date()) {
      await strapi.documents('api::auth-magic.magic-code').update({
        documentId: magic.documentId,
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
    await strapi.documents('api::auth-magic.magic-code').update({
      documentId: magic.documentId,
      data: {
        attempts: magic.attempts + 1,
        used: true // Mark as used on successful verification
      }
    });

    // Log security info
    console.log(`🔐 Magic code verified: ${magic.email || magic.phone} (${magic.channel}) from ${ipAddress}`);

    // If this was a shortener-based link, increment its visit count
    if (magic.shortner) {
      await strapi.documents('api::shortner.shortner').update({
        documentId: magic.shortner.documentId,
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

    try {
      if (!twilioClient) {
        console.warn('Twilio client not initialized');
        return { message, sent: false };
      }

      if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_SENDER) {
        console.warn('Missing:TWILIO_MESSAGING_SERVICE_SID|TWILIO_SENDER');
        return { message, sent: false };
      }

      const messageParams: any = {
        body: message,
        to: phone
      };

      messageParams.from = TWILIO_MESSAGING_SERVICE_SID || TWILIO_SENDER

      const twilioMessage = await twilioClient.messages.create(messageParams);

      console.log(`Welcome SMS sent: ${twilioMessage.sid}`);
      return { message, sent: true, messageSid: twilioMessage.sid, status: twilioMessage.status };

    } catch (error) {
      console.error('Failed to send welcome SMS:', error);
      return { message, sent: false, error: error.message };
    }
  },

  /**
   * Generate TwiML auto-reply for SMS webhook
   * Returns TwiML XML with magic link for auto-response
   */
  async generateSmsAutoReplyTwiML(fromPhone: string, messageBody: string, store?: any) {
    try {
      // Check if message contains magic link keywords
      const triggerWords = ['login', 'signin', 'magic', 'link', 'auth', 'authenticate'];
      const lowerBody = messageBody.toLowerCase();
      const shouldReply = triggerWords.some(word => lowerBody.includes(word));

      if (!shouldReply) {
        return null;
      }

      // Remove whatsapp: prefix if present (normalize phone number)
      const normalizedPhone = fromPhone.replace(/^whatsapp:/, '');

      // Use provided store or fallback
      let resolvedStore = store;
      if (!resolvedStore) {
        // Fallback: lookup default store by slug
        const stores = await strapi.documents('api::store.store').findMany({
          filters: { slug: DEFAULT_STORE_SLUG },
          populate: ['settings'],
          limit: 1
        });
        resolvedStore = stores && stores.length > 0 ? stores[0] : { id: 1 }; // fallback to store ID 1
      }

      // Generate magic code and short URL
      const codeData = await this.generateCode(
        normalizedPhone,
        resolvedStore.id?.toString() || '1',
        'sms',
        'sms-webhook-twiml',
        'Twilio-SMS-Webhook-TwiML'
      );

      // Build short URL if shortner was created
      let shortUrl: string;
      if (codeData.shortner) {
        const shortnerRecord = await strapi.documents('api::shortner.shortner').findOne({
          documentId: codeData.shortner
        });
        const baseUrl = process.env.MARKKET_API_URL || 'https://api.markket.place';
        shortUrl = `${baseUrl}/s/${shortnerRecord.alias}`;
      } else {
        // Fallback to direct magic link using store settings
        const baseUrl = resolvedStore?.settings?.domain || 'https://de.markket.place';
        shortUrl = `${baseUrl}/auth/magic?code=${codeData.code}`;
      }

      // Generate TwiML response
      const replyMessage = `Magic login link: ${shortUrl}`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyMessage}</Message>
</Response>`;

      console.log(`Generated TwiML auto-reply for ${normalizedPhone}`);
      return twimlResponse;

    } catch (error) {
      console.error('Error:Twilio auto reply:', error);
      return null;
    }
  }
});
