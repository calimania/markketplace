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
import { generateRandomSlug } from '../../shortner/services/slug-generator';
import { ACTION_KEYS } from './action-keys';

import {
  createPaymentLinkWithPriceIds,
  verifyStripeWebhook,
  getAccount,
  getStripeClient,
  getSessionById,
} from '../services/stripe';
import { handleCheckoutSessionCompleted } from '../services/stripe-webhook-handler';
import { retrieveAndStoreActualFees } from '../services/stripe-fees-retriever';
import { emailLayout } from '../services/notification/email.template';

const NODE_ENV = process.env.NODE_ENV || 'development';
const STRIPE_PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY || '';
const SENDGRID_REPLY_TO_EMAIL = process.env.SENDGRID_REPLY_TO_EMAIL || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const DEFAULT_STORE_SLUG = process.env.MARKKET_STORE_SLUG || 'next';

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

        console.info(`incoming.SMS: ${body?.From} -> "${body?.Body?.substring(0, 30)}..."`);

        // Find store by slug with settings populated (single lookup)
        const stores = await strapi.documents('api::store.store').findMany({
          filters: { slug: DEFAULT_STORE_SLUG },
          populate: ['settings'],
          limit: 1
        });
        const store = stores && stores.length > 0 ? stores[0] : null;

        // Check for magic link keywords and generate TwiML response
        const autoReplyTwiML = await strapi.service('api::auth-magic.auth-magic').generateSmsAutoReplyTwiML(
          body?.From,
          body?.Body || '',
          store
        );

        if (autoReplyTwiML) {
          console.info(`Twilio: Auto-replying with magic link to ${body?.From}`);

          await strapi.service(modelId).create({
            locale: 'en',
            data: {
              Key: 'twilio.auto_reply.magic_link',
              Content: {
                to: body?.From,
                trigger_message: body?.Body,
                timestamp: new Date().toISOString()
              },
              user_key_or_id: body?.From || '',
            }
          });

          ctx.set('Content-Type', 'text/xml');
          ctx.status = 200;
          return ctx.send(autoReplyTwiML);
        }
      }

    } catch (error) {
      console.error('Error processing Twilio webhook:', error);

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
      // @example: stripe:checkout.session.completed
      body.action = `stripe:${body.type}`;
    }

    console.log(`markket.create:${body.action || 'default'}`);

    // Collect extra metadata for transaction record
    const extraMeta = {
      session_id: body.session_id || null,
      user_id: body.user_id || null,
      status: body.status || null,
      metadata: body.metadata || {},
      schema_version: 2,
      created_at: new Date().toISOString(),
      ip_address: ctx.request.ip || null,
      user_agent: ctx.request.headers['user-agent'] || null,
    };

    if (body?.action === 'stripe.account') {
      const response = await getAccount(body?.store_id);
      return ctx.send({
        message: 'stripe account retrieved',
        data: {
          info: response,
        }
      })
    }
    /**
     * Returns a valid payment link for the client, with stripe connect attribution when present
     * Validates product and prices ids, to check for valid stripe ids
     */
    if (body?.action === ACTION_KEYS.stripeLink) {
      const { product, prices, includes_shipping, stripe_test, store_id, redirect_to_url, total } = body;

      const productData = product
        ? await strapi.documents('api::product.product').findOne({ documentId: product, populate: ['PRICES'] })
        : null;

      const response = await createPaymentLinkWithPriceIds({
        product: productData,
        prices: body?.prices || [],
        include_shipping: !!includes_shipping,
        stripe_test: !!stripe_test,
        store_id,
        redirect_to_url,
        total,
      });

      const order = await strapi.service('api::order.order').create({
        data: {
          store: body.store_id,
          Amount: body.total,
          Currency: 'USD',
          Status: 'open',
          Shipping_Address: {},
          uuid: generateRandomSlug(),
          STRIPE_PAYMENT_ID: response?.link?.id,
          Details: response.details,
          extra: {
            ...extraMeta,
            fees: response?.feeInfo,
            link_creation_debug: {
              requested_total: total,
              calculated_total: prices?.reduce((sum: number, p: any) => sum + ((p.unit_amount || 0) * (p.quantity || 1)), 0),
            }
          },
        }
      });

      console.log('[STRIPE_LINK]createPaymentLink', {
        success: !!response,
        link_id: response?.link?.id,
        link_url: response?.link?.url ? response?.link?.url.substring(0, 50) + '...' : null,
        url_length: response?.link?.url?.length,
        order_id: order.documentId,
        order_amount: order.Amount,
        stripe_payment_id: order.STRIPE_PAYMENT_ID,
      });

      link = {
        response: response.link,
        body,
      };
      message = `order:${order.documentId}`;
    }
    /**
     * Retrieves transaction data to display a receipt for the buyer
     */
    if (body?.action === 'stripe.receipt' && body?.session_id) {
      const response = await getSessionById(body?.session_id, body?.session_id?.includes('cs_test'));
      link = {
        response,
        body,
      };
      message = 'stripe session retrieved';
    }

    if (body?.action === 'stripe:checkout.session.completed') {
      const signature = ctx.request.headers['stripe-signature'];
      const is_test = !!body.data?.object?.id?.startsWith('cs_test_');
      const rawBody = ctx.request.body[Symbol.for('unparsedBody')];

      const event = verifyStripeWebhook(signature, rawBody?.toString(), is_test);

      if (!event) {
        return ctx.badRequest('Invalid webhook signature');
      }

      const session = event.data?.object;

      console.log('[MARKKET_CONTROLLER] Processing checkout session', {
        sessionId: session?.id,
        mode: is_test ? 'test' : 'production'
      });

      try {
        // --- DEC: Decrement inventory after order is completed/paid ---
        const order = await handleCheckoutSessionCompleted(session, is_test);
        const details: any[] = (order as unknown as { Details: [] }).Details || [];
        // const extra = order.extra || {};
        // await strapi.services['order'].updateOrderFromWebhook(order.documentId, details, extra, strapi);

        await strapi.service(modelId).create({
          data: {
            Key: ACTION_KEYS.inventoryDecrement,
            Content: {
              orderId: order.documentId,
              details: details.map(d => ({
                product: d.product,
                Name: d.Name,
                Quantity: d.Quantity,
                Stripe_price_id: d.Stripe_price_id,
              })),
              timestamp: new Date().toISOString(),
              action: 'decrement_inventory_after_payment'
            },
            user_key_or_id: (order as unknown as { buyer: string }).buyer || '',
          }
        });

        console.log('[MARKKET_CONTROLLER] Checkout session processed', {
          orderId: order.documentId,
          amount: order.Amount
        });

        link = { body, order };
        message = `order:${order.documentId}`;
      } catch (error) {
        console.error('[MARKKET_CONTROLLER] Checkout session handling failed:', error?.message);
        return ctx.internalServerError('Failed to process checkout session');
      }
    }

    // Stripe webhooks: Use balance_transaction.created instead
    if (body?.action === 'stripe:balance_transaction.created' || body?.type === 'balance_transaction.created') {
      const signature = ctx.request.headers['stripe-signature'];
      const is_test = !!body.data?.object?.id?.startsWith('txn_test_');
      const rawBody = ctx.request.body[Symbol.for('unparsedBody')];

      const event = verifyStripeWebhook(signature, rawBody?.toString(), is_test);
      if (!event) return ctx.badRequest('Invalid webhook signature');

      const txn = event.data?.object;

      console.log('[STRIPE_WEBHOOK] Balance transaction created', {
        transactionId: txn?.id?.substring(0, 10) + '...',
        type: txn?.type,
        amount_usd: (txn?.amount / 100).toFixed(2),
        fee_usd: (txn?.fee / 100).toFixed(2),
        net_usd: (txn?.net / 100).toFixed(2),
        source: txn?.source?.substring(0, 10) + '...',
        description: txn?.description
      });

      // Try to find order by source (charge/payment intent)
      if (txn?.source) {
        try {
          let orders = await strapi.db.query('api::order.order').findMany({
            where: {
              $or: [
                {
                  extra: {
                    stripe_payment_intent: txn.source
                  }
                },
                {
                  STRIPE_PAYMENT_ID: txn.source
                }
              ]
            },
            limit: 1
          });

          if (orders && orders.length > 0) {
            const order = orders[0];
            const existingExtra = (order.extra as Record<string, any>) || {};

            await strapi.documents('api::order.order').update({
              documentId: order.documentId,
              data: {
                extra: {
                  ...existingExtra,
                  stripe_actual_fees: {
                    fees_cents: txn.fee,
                    fees_usd: (txn.fee / 100).toFixed(2),
                    net_cents: txn.net,
                    net_usd: (txn.net / 100).toFixed(2),
                    amount_cents: txn.amount,
                    amount_usd: (txn.amount / 100).toFixed(2),
                    source: 'balance_transaction_webhook',
                    retrieved_at: new Date().toISOString(),
                  },
                  fees_retrieval_status: 'success_from_balance_webhook'
                }
              }
            });

            console.log('[STRIPE_WEBHOOK] Order updated with actual fees', {
              orderId: order.documentId.substring(0, 10) + '...',
              stripeFeeUsd: (txn.fee / 100).toFixed(2)
            });
          } else {
            console.log('[STRIPE_WEBHOOK] No matching order found', {
              source: txn.source?.substring(0, 10) + '...'
            });
          }
        } catch (error) {
          console.error('[STRIPE_WEBHOOK] Failed to update order:', error?.message);
        }
      }
    }

    // Stripe webhooks: Extract actual fees from charge.succeeded
    if (body?.action === 'stripe:charge.succeeded' || body?.type === 'charge.succeeded' ||
        body?.action === 'stripe:charge.captured' || body?.type === 'charge.captured') {
      const signature = ctx.request.headers['stripe-signature'];
      const is_test = !!body.data?.object?.id?.startsWith('ch_test_');
      const rawBody = ctx.request.body[Symbol.for('unparsedBody')];

      console.log('[STRIPE_WEBHOOK] Verifying charge webhook', {
        hasSignature: !!signature,
        hasRawBody: !!rawBody,
        rawBodyType: typeof rawBody,
        isTest: is_test,
        hasSymbol: !!ctx.request.body[Symbol.for('unparsedBody')],
      });

      const event = verifyStripeWebhook(signature, rawBody, is_test);

      if (!event) {
        console.warn('[STRIPE_WEBHOOK] Signature verification failed - using deferred fee retrieval as fallback');
        // Don't return error - let deferred retrieval handle it
        return ctx.send({ received: true, fallback: 'deferred_retrieval' });
      }

      const charge = event.data?.object;

      console.log('[STRIPE_WEBHOOK] Charge succeeded/captured', {
        chargeId: charge?.id?.substring(0, 10) + '...',
        amount_usd: (charge?.amount / 100).toFixed(2),
        status: charge?.status,
        paymentIntent: charge?.payment_intent?.substring(0, 10) + '...',
        eventType: body?.type,
        hasBalanceTxn: !!charge?.balance_transaction
      });

      // Extract fees from balance_transaction if available
      if (charge?.balance_transaction && charge?.payment_intent) {
        try {
          const stripe = getStripeClient(is_test);
          const balanceTxn = await stripe?.balanceTransactions.retrieve(
            charge.balance_transaction as string
          );

          if (balanceTxn) {
            console.log('[STRIPE_WEBHOOK] Balance transaction retrieved from charge', {
              txnId: balanceTxn.id.substring(0, 10) + '...',
              fee_usd: (balanceTxn.fee / 100).toFixed(2),
              net_usd: (balanceTxn.net / 100).toFixed(2)
            });

            // Find and update order
            const orders = await strapi.db.query('api::order.order').findMany({
              where: {
                $or: [
                  {
                    extra: {
                      stripe_payment_intent: charge.payment_intent
                    }
                  },
                  {
                    STRIPE_PAYMENT_ID: charge.payment_link
                  }
                ]
              },
              limit: 1
            });

            if (orders && orders.length > 0) {
              const order = orders[0];
              const existingExtra = (order.extra as Record<string, any>) || {};

              await strapi.documents('api::order.order').update({
                documentId: order.documentId,
                data: {
                  extra: {
                    ...existingExtra,
                    stripe_actual_fees: {
                      fees_cents: balanceTxn.fee,
                      fees_usd: (balanceTxn.fee / 100).toFixed(2),
                      net_cents: balanceTxn.net,
                      net_usd: (balanceTxn.net / 100).toFixed(2),
                      amount_cents: balanceTxn.amount,
                      amount_usd: (balanceTxn.amount / 100).toFixed(2),
                      source: 'charge_webhook_balance_txn',
                      retrieved_at: new Date().toISOString(),
                    },
                    fees_retrieval_status: 'success_from_charge_webhook'
                  }
                }
              });

              console.log('[STRIPE_WEBHOOK] Order updated with actual fees from charge', {
                orderId: order.documentId.substring(0, 10) + '...',
                stripeFeeUsd: (balanceTxn.fee / 100).toFixed(2)
              });
            }
          }
        } catch (error) {
          console.error('[STRIPE_WEBHOOK] Failed to retrieve balance transaction:', error?.message);
        }
      }
    }

    // Stripe webhook: Capture charge.failed - for error tracking
    if (body?.action === 'stripe:charge.failed' || body?.type === 'charge.failed') {
      const signature = ctx.request.headers['stripe-signature'];
      const is_test = !!body.data?.object?.id?.startsWith('ch_test_');
      const rawBody = ctx.request.body[Symbol.for('unparsedBody')];

      const event = verifyStripeWebhook(signature, rawBody?.toString(), is_test);
      if (!event) return ctx.badRequest('Invalid webhook signature');

      const charge = event.data?.object;

      console.log('[STRIPE_WEBHOOK] Charge failed', {
        chargeId: charge?.id?.substring(0, 10) + '...',
        amount_usd: (charge?.amount / 100).toFixed(2),
        failure_code: charge?.failure_code,
        failure_message: charge?.failure_message,
        paymentIntent: charge?.payment_intent?.substring(0, 10) + '...'
      });

      // Log failure for analysis
      await strapi.service(modelId).create({
        locale: 'en',
        data: {
          Key: 'stripe.charge.failed',
          Content: {
            chargeId: charge?.id,
            amount: (charge?.amount / 100).toFixed(2),
            failureCode: charge?.failure_code,
            failureMessage: charge?.failure_message,
            timestamp: new Date().toISOString()
          },
          user_key_or_id: 'error_tracking'
        }
      });
    }

    // Stripe webhook: Capture payout.paid - seller receives money
    if (body?.action === 'stripe:payout.paid' || body?.type === 'payout.paid') {
      const signature = ctx.request.headers['stripe-signature'];
      const is_test = !!body.data?.object?.id?.startsWith('po_test_');
      const rawBody = ctx.request.body[Symbol.for('unparsedBody')];

      const event = verifyStripeWebhook(signature, rawBody?.toString(), is_test);
      if (!event) return ctx.badRequest('Invalid webhook signature');

      const payout = event.data?.object;

      console.log('[STRIPE_WEBHOOK] Payout paid', {
        payoutId: payout?.id?.substring(0, 10) + '...',
        amount_usd: (payout?.amount / 100).toFixed(2),
        arrivalDate: new Date(payout?.arrival_date * 1000).toISOString(),
        status: payout?.status
      });
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
          ...extraMeta,
        },
        // @TODO: Review authorization, token or related user
        user_key_or_id: body?.user_id || "",
      }
    });

    ctx.send({
      message: `action ${body?.action} completed`,
      data: {
        info: message,
        link: link || '',
        ...extraMeta,
      },
    });
  },

  /**
   * POST /api/markket/refresh-fees/:orderId
   * Manually trigger fee retrieval for an order
   */
  async refreshFees(ctx: any) {
    const { orderId } = ctx.params;

    if (!orderId) {
      return ctx.badRequest('Order ID required');
    }

    try {
      // Get order with payment intent
      const order = await strapi.documents('api::order.order').findOne({
        documentId: orderId
      });

      if (!order) {
        return ctx.notFound('Order not found');
      }

      const extraData = order.extra as Record<string, any>;
      const paymentIntent = extraData?.stripe_payment_intent;
      const isTest = !!extraData?.is_test;

      if (!paymentIntent) {
        return ctx.badRequest('Order has no payment intent');
      }

      console.log('[MARKKET_CONTROLLER] Manually refreshing fees', {
        orderId: orderId.substring(0, 10) + '...',
        paymentIntent: paymentIntent.substring(0, 10) + '...'
      });

      // Trigger fee retrieval
      await retrieveAndStoreActualFees(orderId, paymentIntent, isTest);

      // Fetch updated order
      const updatedOrder = await strapi.documents('api::order.order').findOne({
        documentId: orderId
      });

      return ctx.send({
        message: 'Fee refresh triggered',
        data: {
          orderId,
          stripe_actual_fees: (updatedOrder.extra as Record<string, any>)?.stripe_actual_fees || null,
          retrieval_status: (updatedOrder.extra as Record<string, any>)?.fees_retrieval_status || 'pending'
        }
      });

    } catch (error) {
      console.error('[MARKKET_CONTROLLER] Fee refresh failed:', error?.message);
      return ctx.internalServerError('Fee refresh failed');
    }
  },
  /**
   * GET /api/markket/debug-fees/:orderId
   * Debug fee retrieval status
   */
  async debugFees(ctx: any) {
    const { orderId } = ctx.params;

    const order = await strapi.documents('api::order.order').findOne({
      documentId: orderId
    });

    if (!order) {
      return ctx.notFound('Order not found');
    }

    const extraData = order.extra as Record<string, any>;

    return ctx.send({
      order_id: orderId,
      payment_intent: extraData?.stripe_payment_intent || 'missing',
      current_fees: extraData?.stripe_actual_fees || null,
      retrieval_status: extraData?.fees_retrieval_status || 'not_attempted',
      is_test: extraData?.is_test || false,
      recommendations: [
        extraData?.stripe_payment_intent
          ? 'Payment intent found - can trigger manual refresh'
          : 'No payment intent - cannot retrieve fees',
        extraData?.stripe_actual_fees?.source === 'charge_lookup'
          ? 'Using fallback data - wait for balance transaction webhook'
          : 'Fee data should be complete'
      ]
    });
  },
  /**
   * POST /api/markket/stripe-webhook
   * Dedicated webhook endpoint with raw body handling
   */
  async stripeWebhook(ctx: any) {
    const signature = ctx.request.headers['stripe-signature'];
    const rawBody = ctx.request.body[Symbol.for('unparsedBody')]
      || ctx.request.body[Symbol.for('rawBody')]
      || ctx.req; // Last resort: read from Node req stream

    console.log('[STRIPE_WEBHOOK] Received webhook', {
      hasSignature: !!signature,
      rawBodySymbol: !!ctx.request.body[Symbol.for('unparsedBody')],
      hasReq: !!ctx.req,
    });

    // If Symbol.for doesn't work, read raw stream
    if (!ctx.request.body[Symbol.for('unparsedBody')]) {
      return ctx.badRequest('Raw body not available - check middleware config');
    }

    const body = JSON.parse(rawBody.toString());
    const is_test = !!body.data?.object?.id?.match(/_(test_|live_)/);

    const event = verifyStripeWebhook(signature, rawBody, is_test);

    if (!event) {
      console.error('[STRIPE_WEBHOOK] Verification failed');
      return ctx.badRequest('Invalid signature');
    }

    // Route to appropriate handler based on event type
    console.log('[STRIPE_WEBHOOK] Processing event:', event.type);

    // Handle charge.succeeded, etc.
    // ... your existing webhook logic ...

    return ctx.send({ received: true });
  },

}));
