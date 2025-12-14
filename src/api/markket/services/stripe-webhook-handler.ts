/**
 * Stripe webhook event handling service
 *
 * Processes Stripe webhook events with clear separation of concerns
 * Makes webhook handler more testable and maintainable
 *
 * @module services/stripe-webhook-handler
 */

import { deferredFeeRetrieval } from './stripe-fees-retriever';
import { sendOrderNotification, notifyStoreOfPurchase } from './notification';
import { getStripeClient } from './stripe';

interface CheckoutSessionData {
  paymentIntent: string;
  paymentLinkId: string;
  shipping: any;
  buyerEmail: string;
  isTest: boolean;
  sessionId: string;
}

interface OrderData {
  documentId: string;
  Amount: number;
  STRIPE_PAYMENT_ID: string;
  extra: Record<string, any>;
}

/**
 * Attempt to retrieve actual Stripe fees
 *
 * @async
 * @private
 * @param {CheckoutSessionData} session - Session data
 * @returns {Promise<Record<string, any> | null>} Fee object or null
 */
async function retrieveActualFees(session: CheckoutSessionData): Promise<Record<string, any> | null> {
  if (!session.paymentIntent) {
    return null;
  }

  try {
    const stripe = getStripeClient(session.isTest);
    if (!stripe) return null;

    const balanceTxns = await stripe.balanceTransactions.list({
      source: session.paymentIntent,
      limit: 1,
    });

    if (balanceTxns.data && balanceTxns.data.length > 0) {
      const txn = balanceTxns.data[0];
      return {
        fees_cents: txn.fee,
        fees_usd: (txn.fee / 100).toFixed(2),
        net_cents: txn.net,
        net_usd: (txn.net / 100).toFixed(2),
      };
    }
  } catch (error) {
    console.error('[WEBHOOK_HANDLER] Fee retrieval failed:', error?.message);
  }

  return null;
}

/**
 * Build order from Stripe session data
 *
 * @private
 * @param {any} session - Stripe session object
 * @param {CheckoutSessionData} sessionData - Processed session data
 * @param {Record<string, any>} actualStripeFees - Actual fees or null
 * @returns {Object} Order data ready for creation
 */
function buildOrderData(
  session: any,
  sessionData: CheckoutSessionData,
  actualStripeFees: Record<string, any> | null
): any {
  return {
    data: {
      STRIPE_PAYMENT_ID: session.id,
      Amount: session.amount_total ? session.amount_total / 100 : 0,
      Currency: session.currency?.toUpperCase() || 'USD',
      Status: 'complete',
      store: session.metadata?.store_id || null,
      Shipping_Address: {
        name: sessionData.shipping?.name || session.customer_details?.name,
        email: sessionData.buyerEmail,
        street: sessionData.shipping?.address?.line1 || sessionData.shipping?.line1,
        street_2: sessionData.shipping?.address?.line2 || sessionData.shipping?.line2,
        city: sessionData.shipping?.address?.city || sessionData.shipping?.city,
        state: sessionData.shipping?.address?.state || sessionData.shipping?.state,
        zipcode: sessionData.shipping?.address?.postal_code || sessionData.shipping?.postal_code,
        country: sessionData.shipping?.address?.country || sessionData.shipping?.country,
      },
      Payment_attempts: [{
        Timestampt: new Date(),
        buyer_email: sessionData.buyerEmail,
        Status: 'Succeeded',
        reason: '',
        session_id: session.id,
        amount: session.amount_total ? session.amount_total / 100 : 0,
        currency: session.currency?.toUpperCase() || 'USD'
      }],
      Details: session.line_items?.data?.map((item: any) => ({
        Price: (item.amount_total || 0) / 100,
        product: item.price?.product || null,
        Quantity: item.quantity || 1,
        Name: item.description || item.price?.product?.name || '',
        Metadata: item.price?.metadata || {}
      })) || [],
      extra: {
        stripe_session_id: session.id,
        stripe_payment_link: sessionData.paymentLinkId,
        stripe_payment_intent: sessionData.paymentIntent,
        stripe_customer: session.customer,
        stripe_customer_details: session.customer_details,
        stripe_payment_status: session.payment_status,
        stripe_mode: session.mode,
        created_from: 'webhook_fallback',
        created_at: new Date().toISOString(),
        is_test: session.id.startsWith('cs_test_'),
        session_metadata: session.metadata || {},
        stripe_actual_fees: actualStripeFees,
      }
    }
  };
}

/**
 * Handle Stripe checkout.session.completed webhook
 *
 * Main entry point for processing completed checkout sessions
 *
 * @async
 * @param {any} session - Stripe session from event
 * @param {boolean} isTest - Whether this is a test mode session
 * @returns {Promise<OrderData>} Updated order data
 */
export async function handleCheckoutSessionCompleted(
  session: any,
  isTest: boolean
): Promise<OrderData> {
  const sessionData: CheckoutSessionData = {
    paymentIntent: session.payment_intent,
    paymentLinkId: session.payment_link,
    shipping: session.shipping_details || session.customer_details || session?.shipping,
    buyerEmail: session.customer_details?.email,
    isTest,
    sessionId: session.id,
  };

  // Attempt immediate fee retrieval
  const actualStripeFees = await retrieveActualFees(sessionData);

  // Find existing order by payment link
  let order = sessionData.paymentLinkId ? await strapi.db.query('api::order.order').findOne({
    where: { STRIPE_PAYMENT_ID: sessionData.paymentLinkId },
    populate: ['store.users', 'store.settings', 'Shipping_Address', 'buyer', 'Details', 'Payment_attempts']
  }) : null;

  if (!order) {
    console.log('[WEBHOOK_HANDLER] Creating new order from session');
    const orderData = buildOrderData(session, sessionData, actualStripeFees);

    order = await strapi.service('api::order.order').create(orderData);
  } else {
    console.log('[WEBHOOK_HANDLER] Updating existing order');

    const prevAttempts = Array.isArray(order.Payment_attempts) ? order.Payment_attempts : [];
    const newAttempt = {
      Timestampt: new Date(),
      buyer_email: sessionData.buyerEmail,
      Status: 'Succeeded',
      reason: '',
      session_id: session.id,
    };

    order = await strapi.service('api::order.order').update(order.documentId, {
      populate: ['Shipping_Address', 'store', 'Details'],
      data: {
        Status: 'complete',
        Payment_attempts: [...prevAttempts, newAttempt],
        Shipping_Address: {
          name: sessionData.shipping?.name || session.customer_details?.name || order.Shipping_Address?.name,
          email: sessionData.buyerEmail || order.Shipping_Address?.email,
          street: sessionData.shipping?.address?.line1 || sessionData.shipping?.line1,
          street_2: sessionData.shipping?.address?.line2 || sessionData.shipping?.line2,
          city: sessionData.shipping?.address?.city || sessionData.shipping?.city,
          state: sessionData.shipping?.address?.state || sessionData.shipping?.state,
          zipcode: sessionData.shipping?.address?.postal_code || sessionData.shipping?.postal_code,
          country: sessionData.shipping?.address?.country || sessionData.shipping?.country,
        },
        extra: {
          ...(order.extra as Record<string, any>),
          stripe_session_id: session.id,
          stripe_payment_intent: sessionData.paymentIntent,
          stripe_actual_fees: actualStripeFees,
        },
      }
    });
  }

  // Schedule deferred fee retrieval if needed
  if (sessionData.paymentIntent && !actualStripeFees) {
    deferredFeeRetrieval(
      order.documentId,
      sessionData.paymentIntent,
      isTest,
      2000
    );
  }

  // Notify store of purchase
  if (order?.store?.documentId) {
    const storeUsers = order?.store?.users || [];
    const emails = new Set(storeUsers.filter((user: any) => user.confirmed).map((user: any) => user.email));
    const storeSettingsEmail = order.store?.settings?.support_email || order.store?.settings?.reply_to_email;

    if (storeSettingsEmail) {
      emails.add(storeSettingsEmail);
    }

    if (emails.size > 0) {
      // ✅ FIXED: Cast Set to string array
      await notifyStoreOfPurchase({
        strapi,
        order,
        emails: Array.from(emails) as string[],
        store: order.store as any
      });
    }
  }

  // Send order notification to buyer
  await sendOrderNotification({ strapi, order, store: order.store });

  return order;
}
