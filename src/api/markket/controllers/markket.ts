/**
 * markket controller
 *
 * Interfaces with our data & other extensions to augment functionality
 *
 * Features:
 *  - Activity log
 *  - Stripe webhooks
 *  - Stripe payment links
 *  - Stripe connect actions
 *  - Twilio Sendgrid emails
 *
 * @TODO: Abstract model creation to utilities
 */
import { version } from '../../../../package.json';
import * as crypto from 'crypto';
const { createCoreController } = require('@strapi/strapi').factories;
const modelId = "api::markket.markket";

import { createPaymentLinkWithPriceIds, getSessionById, getAccount } from '../services/stripe';
import { sendOrderNotification, notifyStoreOfPurchase } from '../services/notification';
import { emailLayout } from '../services/notification/email.template';

const NODE_ENV = process.env.NODE_ENV || 'development';
const STRIPE_PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY || 'n/a';
const SENDGRID_REPLY_TO_EMAIL = process.env.SENDGRID_REPLY_TO_EMAIL || 'n/a';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

/**
 * Verify Twilio webhook signature to ensure authenticity
 * Implements Twilio's official signature validation algorithm
 */
const verifyTwilioSignature = (twilioSignature: string, url: string, params: any, authToken: string): boolean => {
  if (!authToken) {
    console.warn('TWILIO_AUTH_TOKEN not present');
    return false;
  }

  if (!twilioSignature) {
    console.warn('missing-header:X-Twilio-Signature');
    return false;
  }

  try {
    // Build the signature string according to Twilio spec
    const data = Object.keys(params || {})
      .sort()
      .reduce((acc, key) => {
        return acc + key + (params[key] || '');
      }, url);

    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(twilioSignature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );

  } catch (error) {
    console.error('Twilio signature verification error:', error);
    return false;
  }
};

/**
 * email:jo***@example.com
 */
const censor = (to: string | string[]) => {
  return (Array.isArray(to)
    ? to.map(email => email.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2')).join(', ')
    : to.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2'));
}

module.exports = createCoreController(modelId, ({ strapi }) => ({
  async about(ctx: any) {
    console.info('markket.get');
    ctx.send({
      message: 'about',
      data: {
        info: 'markkët.place',
        version,
        NODE_ENV,
        STRIPE_PUBLIC_KEY,
        SENDGRID_REPLY_TO_EMAIL,
      },
    });
  },

  /**
   * POST /api/markket/twilio-sms
   * Handle incoming SMS from Twilio and respond with TwiML
   * Security: Only processes verified webhooks from Twilio
   */
  async twilioSms(ctx: any) {
    console.info('🔔 Twilio SMS webhook received');

    // Default TwiML response - always sent regardless of verification
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>markkët! 💜 Learn more https://de.markket.place</Message>
</Response>`;

    let isVerifiedWebhook = false;

    try {
      const body = ctx.request.body;
      const twilioSignature = ctx.request.headers['x-twilio-signature'];

      // Get the full URL for signature verification
      const protocol = ctx.request.header['x-forwarded-proto'] || ctx.protocol;
      const host = ctx.request.header['x-forwarded-host'] || ctx.request.header.host;
      const url = `${protocol}://${host}${ctx.request.url}`;

      console.log('SMS.Details:', {
        from: body?.From,
        message_preview: body?.Body?.substring(0, 50) + '...',
        has_signature: !!twilioSignature
      });

      if (TWILIO_AUTH_TOKEN) {
        isVerifiedWebhook = verifyTwilioSignature(twilioSignature, url, body, TWILIO_AUTH_TOKEN);

        if (!isVerifiedWebhook) {
          console.warn('Invalid Twilio signature - rejecting webhook');

          // Log security incident
          await strapi.service(modelId).create({
            locale: 'en',
            data: {
              Key: 'twilio.security.invalid_signature',
              Content: {
                attempted_from: body?.From || 'unknown',
                attempted_message: body?.Body || '',
                signature_provided: !!twilioSignature,
                url: url,
                timestamp: new Date().toISOString(),
                severity: 'warning',
                action: 'webhook_rejected'
              },
              user_key_or_id: 'security_log',
            }
          });

          // Respond normally to avoid webhook retries
          ctx.set('Content-Type', 'text/xml');
          ctx.status = 200;
          return ctx.send(twiml);
        }

        console.info('Twilio signature verified: incoming sms');
      } else {
        console.warn('TWILIO_AUTH_TOKEN not present');
        // isVerifiedWebhook = true; // Allow processing in development
      }

      // Only create SMS records for verified webhooks
      if (isVerifiedWebhook) {
        await strapi.service(modelId).create({
          locale: 'en',
          data: {
            Key: 'twilio.incoming.sms',
            Content: {
              from: body?.From || 'unknown',
              to: body?.To || 'unknown',
              message: body?.Body || '',
              messageSid: body?.MessageSid || '',
              accountSid: body?.AccountSid || '',
              timestamp: new Date().toISOString(),
              verified: !!TWILIO_AUTH_TOKEN,
              webhook_source: 'twilio_sms'
            },
            user_key_or_id: body?.From || '',
          }
        });

        console.info(`✅ SMS logged: ${body?.From} -> "${body?.Body?.substring(0, 30)}..."`);
      }

    } catch (error) {
      console.error('❌ Error processing Twilio webhook:', error);

      // Log the error but still respond to Twilio
      try {
        await strapi.service(modelId).create({
          locale: 'en',
          data: {
            Key: 'twilio.webhook.error',
            Content: {
              error: error.message,
              timestamp: new Date().toISOString(),
              verified: isVerifiedWebhook
            },
            user_key_or_id: 'error_log',
          }
        });
      } catch (logError) {
        console.error('Failed to log webhook error:', logError);
      }
    }

    // Always respond with TwiML
    ctx.set('Content-Type', 'text/xml');
    ctx.status = 200;
    return ctx.send(twiml);
  },
  /**
   * POST /api/markket/send-email
   * Send branded email using store settings
   */
  async email(ctx: any) {
    try {
      const {
        to,
        subject,
        content,
        title,
        store_id,
        from_name,
        reply_to
      } = ctx.request.body;

      if (!to || !subject || !content || !title || !store_id) {
        return ctx.badRequest('400:email:[to,subject,content,title,store_id]');
      }

      const store = await strapi.documents('api::store.store').findOne({
        documentId: store_id,
        populate: ['settings', 'Logo'],
      });

      if (!store) {
        return ctx.badRequest(`404:store:${store_id}`);
      }

      const fromEmail = SENDGRID_REPLY_TO_EMAIL; // whitelisted in twilio settings
      const storeName = from_name || store?.settings?.store_name_override || store?.title;
      const replyToEmail = reply_to || store?.settings?.reply_to_email || fromEmail;

      await strapi.plugins['email'].services.email.send({
        to: Array.isArray(to) ? to : [to],
        from: `${storeName} <${fromEmail}>`,
        replyTo: replyToEmail,
        subject,
        html: emailLayout({
          content,
          title: title || subject,
          store
        }),
      });

      console.info(`markket:email:${censor(to)}:store:${store_id}`);

      return ctx.send({
        message: 'sent',
        data: {
          to,
          subject,
          store: store ? {
            id: store.documentId,
            title: store.title,
            settings_applied: !!store.settings
          } : null,
        }
      });

    } catch (error) {
      console.error('Error sending email:', error);
      return ctx.internalServerError('Failed to send email');
    }
  },
  async create(ctx: any) {
    console.info('markket.create');
    const body = ctx.request?.body || {};
    let message = 'action started';
    let link = body;

    if (body?.id?.startsWith('evt_')) {
      body.action = `stripe:${body.type}`;
    }

    console.log(`markket.create:${body.action || 'default'}`);

    if (body?.action === 'stripe.link') {
      const { product, prices, includes_shipping, stripe_test, store_id, redirect_to_url, total } = body;

      const response = await createPaymentLinkWithPriceIds({
        prices: body?.prices || [],
        include_shipping: !!includes_shipping,
        stripe_test: !!stripe_test,
        store_id,
        redirect_to_url,
        total,
      });

      link = {
        response,
        body,
      };

      const order = await strapi.service('api::order.order').create({
        data: {
          store: body.store_id,
          Amount: body.total,
          Currency: 'USD',
          Status: 'open',
          Shipping_Address: {},
          STRIPE_PAYMENT_ID: response?.id,
          Details: prices.map((price: any) => {
            return {
              Price: parseInt(price?.unit_amount || '0', 10),
              product,
              Quantity: parseInt(price.quantity || '0', 10),
              Name: price?.Name,
            }
          })
        }
      });
      message = `order:${order.documentId}`;
    }

    if (body?.action == 'stripe:checkout.session.completed') {
      const session = body.data?.object as any;
      const paymentLinkId = session.payment_link;
      const shipping = session.shipping || session.customer_details?.address;
      const buyer_email = session.customer_details?.email || body.customer_email;
      const storeUsers = [];

      const order = paymentLinkId && await strapi.db.query('api::order.order').findOne({
        where: { STRIPE_PAYMENT_ID: paymentLinkId },
        populate: ['store.users']
      });

      if (order) {
        console.log(`updating:order:${order.documentId}`);
        const prevAttempts = Array.isArray(order.Payment_attempts) ? order.Payment_attempts : [];
        const newAttempt = {
          Timestampt: new Date(),
          buyer_email: buyer_email,
          Status: 'Succeeded',
          reason: '',
        };

        let shippingData = order.Shipping_Address;
        if (!shippingData && shipping) {
          shippingData = {
            street: shipping.address?.line1 || shipping.line1,
            street_2: shipping.address?.line2 || shipping.line2,
            city: shipping.address?.city || shipping.city,
            state: shipping.address?.state || shipping.state,
            zipcode: shipping.address?.postal_code || shipping.postal_code,
            country: shipping.address?.country || shipping.country,
            name: shipping.name || session.customer_details?.name,
            email: buyer_email,
          };
        }

        const update = await strapi.service('api::order.order').update(order.documentId, {
          data: {
            Status: 'complete',
            Payment_attempts: [
              ...prevAttempts,
              newAttempt
            ],
            Shipping_Address: shippingData || order.Shipping_Address,
          }
        });
        console.log(`updating:order:${update.documentId}`);
      }

      if (order?.store?.documentId) {
        storeUsers.push(...order?.store?.users);
        const emails = storeUsers.filter(user => user.confirmed).map(user => user.email);

        if (emails?.length > 0) {
          await notifyStoreOfPurchase({ strapi, order, emails, store: order?.store as {} });
        }
      }

      const response = sendOrderNotification({ strapi, order: body });
      link = { body, response };
    }

    if (body?.action === 'stripe.account') {
      const response = await getAccount(body?.store_id);
      return ctx.send({
        message: 'stripe account retrieved',
        data: {
          info: response,
        },
      });
    }

    if (body?.action === 'stripe.receipt' && body?.session_id) {
      const response = await getSessionById(body?.session_id, body?.session_id?.includes('cs_test'));
      link = {
        response,
        body,
      };
      message = 'stripe session retrieved';
    }

    // Create a markket transaction record
    await strapi.service(modelId).create({
      locale: 'en',
      data: {
        Key: `markket.create.${body?.action || 'default'}`,
        Content: {
          link: link || '',
          product: body?.product,
          total: body?.total,
        },
        // @TODO: Review authorization, token or related user
        user_key_or_id: "",
      }
    });

    ctx.send({
      message: `action ${body?.action} completed`,
      data: {
        info: message,
        link: link || '',
      },
    });
  },
}));
