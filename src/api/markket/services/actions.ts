import { generateRandomSlug } from '../../shortner/services/slug-generator';
import { ACTION_KEYS } from '../controllers/action-keys';
import { handleCheckoutSessionCompleted } from '../services/stripe-webhook-handler';
import {
  createPaymentLinkWithPriceIds,
  getAccount,
  getStripeClient,
  getSessionById,
  verifyStripeWebhook,
  ProductForPaymentLink
} from './stripe';

const modelId = "api::markket.markket";

const createAction = async (ctx: any) => {
  console.info('markket.create');
  const body = ctx.request?.body || {};

  let message = 'action started';
  let logPayload: any = null; // Decoupled from incoming body to prevent database bloat
  let responseData: any = null;

  // 1. Normalize and identify early if this is a Webhook
  const isWebhook = body?.id?.startsWith('evt_');
  let action = body?.action || body?.type || 'default';

  if (isWebhook) {
    action = `stripe:${body.type}`;
  }

  console.log(`markket.create execution path: ${action}, isWebhook?: ${isWebhook}`);

  // 2. Unify Webhook Validation up front
  let verifiedEvent: any = null;
  let is_test = false;

  if (isWebhook || action.startsWith('stripe:')) {
    const signature = ctx.request.headers['stripe-signature'];
    // Safely extract the raw unparsed string buffer required by Stripe
    const rawBuffer = ctx.request.body[Symbol.for('unparsedBody')];
    const rawBodyString = rawBuffer instanceof Buffer ? rawBuffer.toString('utf8') : rawBuffer;

    // Fallback detection logic for test environment flags
    const testIdCheck = body.data?.object?.id || '';
    is_test = !!(testIdCheck.startsWith('cs_test_') || testIdCheck.startsWith('txn_test_') || testIdCheck.startsWith('ch_test_') || testIdCheck.startsWith('po_test_'));

    verifiedEvent = verifyStripeWebhook(signature, rawBodyString, is_test);

    if (!verifiedEvent) {
      console.error(`[STRIPE_WEBHOOK] Refused execution. Signature verification failed for event: ${body?.type}`);
      return ctx.badRequest('Invalid webhook signature');
    }
  }

  const extraMeta = {
    session_id: body.session_id || null,
    user_id: body.user_id || null,
    status: body.status || null,
    schema_version: 2,
    created_at: new Date().toISOString(),
    ip_address: ctx.request.ip || null,
    user_agent: ctx.request.headers['user-agent'] || null,
  };

  switch (action) {
    case 'stripe.account': {
      const response = await getAccount(body?.store_id);
      return ctx.send({
        message: 'stripe account retrieved',
        data: { info: response }
      });
    }

    case ACTION_KEYS.stripeLink: {
      const { product, prices = [], includes_shipping, stripe_test, store_id, redirect_to_url, total, countries } = body;

      const productData = product
        ? await strapi.documents('api::product.product').findOne({ documentId: product, populate: ['PRICES'] })
        : null;

      if (!productData) {
        return ctx.badRequest(`Product with ID "${product}" could not be found.`);
      }

      const recurring = {
        billing_type: 'one_time',
        billing_interval: undefined,
        billing_interval_count: 0,
      }

      // Inventory check validation
      if (Array.isArray(productData.PRICES)) {
        for (const orderPrice of prices) {
          const matchedPrice = productData.PRICES.find((p: any) => p.STRIPE_ID === orderPrice.price) as any;

          if (matchedPrice.billing_type !== 'one_time') {
            recurring.billing_type = matchedPrice.billing_type;
            recurring.billing_interval = matchedPrice.billing_interval;
            recurring.billing_interval_count = matchedPrice.billing_interval_count;
          }

          if (matchedPrice && typeof matchedPrice.inventory === 'number') {
            const requestedQty = orderPrice.quantity || 1;
            if (matchedPrice.inventory === 0) {
              return ctx.badRequest(`Product/price "${matchedPrice.Name}" is out of stock`);
            }
            if (requestedQty > matchedPrice.inventory) {
              return ctx.badRequest(`Product/price "${matchedPrice.Name}" requested quantity (${requestedQty}) exceeds available inventory:[(${matchedPrice.inventory})]`);
            }
          }
        }
      }

      try {
        const response = await createPaymentLinkWithPriceIds({
          product: productData as any as ProductForPaymentLink,
          prices,
          include_shipping: !!includes_shipping,
          stripe_test: !!stripe_test,
          store_id,
          redirect_to_url,
          total,
          countries,
        });

        if (!response?.link) {
          return ctx.badRequest('Stripe failed to return a valid payment link context.');
        }

        const order = await strapi.service('api::order.order').create({
          data: {
            store: body.store_id,
            Amount: body.total,
            Currency: 'USD',
            Status: 'open',
            Shipping_Address: {},
            uuid: generateRandomSlug(),
            STRIPE_PAYMENT_ID: response.link.id,
            Details: response.details,
            ...recurring,
            prices_snapshot: [prices],
            extra: {
              ...extraMeta,
              fees: response.feeInfo,
              link_creation_debug: {
                requested_total: total,
                calculated_total: prices?.reduce((sum: number, p: any) => sum + ((p.unit_amount || 0) * (p.quantity || 1)), 0),
              }
            },
          }
        });

        logPayload = { payment_link_id: response.link.id, order_id: order.documentId };
        responseData = response.link;
        message = `order:${order.documentId}`;
      } catch (err: any) {
        console.error('[STRIPE_LINK_CREATION_ERR]', err);
        return ctx.internalServerError(`Payment execution failed: ${err.message}`);
      }
      break;
    }

    case 'stripe.receipt': {
      if (body?.session_id) {
        const response = await getSessionById(body?.session_id, body?.session_id?.includes('cs_test'));
        responseData = response;
        logPayload = { session_id: body.session_id };
        message = 'stripe session retrieved';
      }
      break;
    }

    case ACTION_KEYS.stripeCheckoutSessionCompleted:
    case 'stripe:checkout.session.completed': {
      const sessionObj = verifiedEvent.data?.object;
      try {
        const order = await handleCheckoutSessionCompleted(sessionObj, is_test);
        logPayload = { order_id: order?.documentId, stripe_session_id: sessionObj?.id };
        responseData = { success: true };
        message = `order:${order?.documentId}`;
      } catch (error: any) {
        console.error('[MARKKET_CONTROLLER] Checkout session processing failure:', error?.message);
        return ctx.internalServerError('Failed to process custom checkout business logic rules');
      }
      break;
    }

    case 'stripe:balance_transaction.created': {
      const txn = verifiedEvent.data?.object;
      logPayload = { transaction_id: txn?.id };

      if (txn?.source) {
        try {
          const orders = await strapi.db.query('api::order.order').findMany({
            where: {
              $or: [
                { extra: { stripe_payment_intent: txn.source } },
                { STRIPE_PAYMENT_ID: txn.source }
              ]
            },
            limit: 1
          });

          if (orders?.length > 0) {
            const order = orders[0];
            await strapi.documents('api::order.order').update({
              documentId: order.documentId,
              data: {
                extra: {
                  ...((order.extra as object) || {}),
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
          }
        } catch (error: any) {
          console.error('[STRIPE_WEBHOOK] Failed to update balance fee mappings:', error?.message);
        }
      }
      break;
    }

    case 'stripe:charge.succeeded':
    case 'stripe:charge.captured': {
      const charge = verifiedEvent.data?.object;
      logPayload = { charge_id: charge?.id };

      if (charge?.balance_transaction && charge?.payment_intent) {
        try {
          const stripe = getStripeClient(is_test);
          const balanceTxn = await stripe?.balanceTransactions.retrieve(charge.balance_transaction as string);

          if (balanceTxn) {
            const orders = await strapi.db.query('api::order.order').findMany({
              where: {
                $or: [
                  { extra: { stripe_payment_intent: charge.payment_intent } },
                  { STRIPE_PAYMENT_ID: charge.payment_link }
                ]
              },
              limit: 1
            });

            if (orders?.length > 0) {
              const order = orders[0];
              await strapi.documents('api::order.order').update({
                documentId: order.documentId,
                data: {
                  extra: {
                    ...((order.extra as object) || {}),
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
            }
          }
        } catch (error: any) {
          console.error('[STRIPE_WEBHOOK] Failed to extract charges metadata details:', error?.message);
        }
      }
      break;
    }

    case 'stripe:charge.failed': {
      const charge = verifiedEvent.data?.object;
      logPayload = { charge_id: charge?.id, failure_code: charge?.failure_code };

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
      break;
    }

    case 'stripe:payout.paid': {
      const payout = verifiedEvent.data?.object;
      logPayload = { payout_id: payout?.id };
      break;
    }

    default:
      console.info(`[markket.create] Fallback reached for unexpected command sequence execution: ${action}`);
      break;
  }

  // 3. Document Transaction Audit Log clean (No structural payload duplicates)
  await strapi.service(modelId).create({
    locale: 'en',
    data: {
      Key: `markket.create.${action}`,
      Content: {
        executionSummary: logPayload,
        product: body?.product || null,
        total: body?.total || null,
        ...extraMeta,
      },
      user_key_or_id: body?.user_id || "system_webhook",
    }
  });

  return ctx.send({
    message: `action ${action} completed`,
    data: {
      info: message,
      result: responseData,
      ...extraMeta,
    },
  });
};

export { createAction };