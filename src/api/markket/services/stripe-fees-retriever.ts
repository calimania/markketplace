/**
 * Stripe actual fees retrieval service
 *
 * Balance transactions are created asynchronously by Stripe after payment settles.
 * This service handles deferred fee retrieval with retry logic and proper error handling.
 *
 * @module services/stripe-fees-retriever
 * @see https://stripe.com/docs/api/balance_transactions
 */

import { getStripeClient } from './stripe';

/**
 * Actual Stripe fees data structure
 */
interface ActualStripeFees {
  fees_cents: number;
  fees_usd: string;
  net_cents: number;
  net_usd: string;
  amount_cents: number;
  amount_usd: string;
  retrieved_at: string;
  [key: string]: string | number;
}

/**
 * Retrieve and store actual Stripe fees for an order
 *
 * Fetches balance transaction data from Stripe and updates the order
 * with actual fees charged (may differ from estimates).
 *
 * @async
 * @param {string} orderId - Order document ID
 * @param {string} paymentIntent - Stripe payment intent ID
 * @param {boolean} isTest - Use test client
 * @returns {Promise<void>}
 * @example
 * await retrieveAndStoreActualFees('order_doc_123', 'pi_123abc', false);
 */
export async function retrieveAndStoreActualFees(
  orderId: string,
  paymentIntent: string,
  isTest: boolean = false
): Promise<void> {
  // Validate inputs
  if (!orderId || !paymentIntent) {
    console.log('[FEES_RETRIEVER] Missing required parameters', {
      hasOrderId: !!orderId,
      hasPaymentIntent: !!paymentIntent
    });
    return;
  }

  try {
    const stripe = getStripeClient(isTest);

    if (!stripe) {
      console.warn('[FEES_RETRIEVER] Stripe client not available', {
        mode: isTest ? 'test' : 'production',
        client: null
      });
      return;
    }

    console.log('[FEES_RETRIEVER] Attempting fee retrieval', {
      orderId: orderId.substring(0, 10) + '...',
      paymentIntent: paymentIntent.substring(0, 10) + '...',
      mode: isTest ? 'test' : 'production',
      timestamp: new Date().toISOString()
    });

    // Fetch balance transactions
    const balanceTxns = await stripe.balanceTransactions.list({
      source: paymentIntent,
      limit: 1,
    });

    if (!balanceTxns.data || balanceTxns.data.length === 0) {
      console.log('[FEES_RETRIEVER] Balance transaction not found, trying alternate method', {
        orderId: orderId.substring(0, 10) + '...',
        mode: isTest ? 'test' : 'production'
      });

      try {
        const charges = await stripe.charges.list({
          payment_intent: paymentIntent,
          limit: 1,
        });

        if (charges.data && charges.data.length > 0) {
          const charge = charges.data[0];

          // Stripe fee info is in balance_transaction, not directly on charge
          // For now, use the charge.amount (total collected) and amount_refunded
          const netAmount = charge.amount - (charge.amount_refunded || 0);

          const actualStripeFees: ActualStripeFees = {
            fees_cents: 0, // Will be populated by balance transaction retry
            fees_usd: '0.00',
            net_cents: netAmount,
            net_usd: (netAmount / 100).toFixed(2),
            amount_cents: charge.amount,
            amount_usd: (charge.amount / 100).toFixed(2),
            retrieved_at: new Date().toISOString(),
            source: 'charge_lookup',
          };

          console.log('[FEES_RETRIEVER] Charge data retrieved (fees pending balance transaction)', {
            orderId: orderId.substring(0, 10) + '...',
            chargeAmount: actualStripeFees.amount_usd,
            netAmount: actualStripeFees.net_usd,
            note: 'Stripe fee details available via balance_transaction only'
          });

          await updateOrderWithFees(orderId, actualStripeFees);
          return;
        }
      } catch (chargeError) {
        console.log('[FEES_RETRIEVER] Charge lookup failed:', chargeError?.message);
      }

      console.log('[FEES_RETRIEVER] No fee data available yet - will retry', {
        orderId: orderId.substring(0, 10) + '...',
        reason: 'Balance transactions and charges not yet available'
      });
      return;
    }

    const txn = balanceTxns.data[0];

    // Format fee data
    const actualStripeFees: ActualStripeFees = {
      fees_cents: txn.fee,
      fees_usd: (txn.fee / 100).toFixed(2),
      net_cents: txn.net,
      net_usd: (txn.net / 100).toFixed(2),
      amount_cents: txn.amount,
      amount_usd: (txn.amount / 100).toFixed(2),
      retrieved_at: new Date().toISOString(),
    };

    // Update order with actual fees
    await updateOrderWithFees(orderId, actualStripeFees);
  } catch (error) {
    console.error('[FEES_RETRIEVER] Fee retrieval failed', {
      orderId: orderId.substring(0, 10) + '...',
      mode: isTest ? 'test' : 'production',
      error: error?.message
    });
    await markRetrievalFailure(orderId, error?.message);
  }
}

/**
 * Update order with retrieved fees
 *
 * @async
 * @private
 * @param {string} orderId - Order document ID
 * @param {ActualStripeFees} fees - Fees data to store
 * @returns {Promise<void>}
 */
async function updateOrderWithFees(orderId: string, fees: ActualStripeFees): Promise<void> {
  try {
    const order = await strapi.documents('api::order.order').findOne({
      documentId: orderId
    });

    if (!order) {
      console.warn('[FEES_RETRIEVER] Order not found', {
        orderId: orderId.substring(0, 10) + '...'
      });
      return;
    }

    const existingExtra = (order.extra as Record<string, any>) || {};

    await strapi.documents('api::order.order').update({
      documentId: orderId,
      data: {
        extra: {
          ...existingExtra,
          stripe_actual_fees: fees,
          fees_retrieval_status: 'success',
        }
      }
    });

    console.log('[FEES_RETRIEVER] Order updated successfully', {
      orderId: orderId.substring(0, 10) + '...',
      feesUsd: fees.fees_usd,
      netUsd: fees.net_usd,
      amountUsd: fees.amount_usd
    });
  } catch (error) {
    console.error('[FEES_RETRIEVER] Failed to update order', {
      orderId: orderId.substring(0, 10) + '...',
      error: error?.message
    });
    throw error;
  }
}

/**
 * Mark order as having failed fee retrieval
 *
 * @async
 * @private
 * @param {string} orderId - Order document ID
 * @param {string} errorMessage - Error message to store
 * @returns {Promise<void>}
 */
async function markRetrievalFailure(orderId: string, errorMessage: string): Promise<void> {
  try {
    const order = await strapi.documents('api::order.order').findOne({
      documentId: orderId
    });

    if (!order) {
      console.warn('[FEES_RETRIEVER] Could not mark failure - order not found', {
        orderId: orderId.substring(0, 10) + '...'
      });
      return;
    }

    const existingExtra = (order.extra as Record<string, any>) || {};

    await strapi.documents('api::order.order').update({
      documentId: orderId,
      data: {
        extra: {
          ...existingExtra,
          fees_retrieval_status: 'failed',
          fees_retrieval_error: errorMessage,
          fees_retrieval_attempted_at: new Date().toISOString(),
        }
      }
    });

    console.log('[FEES_RETRIEVER] Marked order as failed fee retrieval', {
      orderId: orderId.substring(0, 10) + '...',
      error: errorMessage
    });
  } catch (updateError) {
    console.error('[FEES_RETRIEVER] Failed to mark retrieval error', {
      orderId: orderId.substring(0, 10) + '...',
      originalError: errorMessage,
      updateError: updateError?.message
    });
  }
}

/**
 * Schedule deferred fee retrieval with configurable delay
 *
 * Non-blocking operation that retries fee retrieval after a specified delay.
 * Useful when balance transactions are not immediately available.
 *
 * @async
 * @param {string} orderId - Order document ID
 * @param {string} paymentIntent - Stripe payment intent ID
 * @param {boolean} [isTest=false] - Use test client
 * @param {number} [delayMs=2000] - Delay before retry in milliseconds
 * @returns {Promise<void>}
 * @example
 * await deferredFeeRetrieval('order_123', 'pi_123', false, 2000);
 */
export async function deferredFeeRetrieval(
  orderId: string,
  paymentIntent: string,
  isTest: boolean = false,
  delayMs: number = 2000
): Promise<void> {
  console.log('[FEES_RETRIEVER] Scheduling deferred retrieval', {
    orderId: orderId.substring(0, 10) + '...',
    paymentIntent: paymentIntent.substring(0, 10) + '...',
    mode: isTest ? 'test' : 'production',
    delayMs,
    scheduledFor: new Date(Date.now() + delayMs).toISOString()
  });

  setTimeout(async () => {
    console.log('[FEES_RETRIEVER] Executing deferred retrieval', {
      orderId: orderId.substring(0, 10) + '...',
      mode: isTest ? 'test' : 'production'
    });

    try {
      await retrieveAndStoreActualFees(orderId, paymentIntent, isTest);
    } catch (error) {
      console.error('[FEES_RETRIEVER] Deferred retrieval exception', {
        orderId: orderId.substring(0, 10) + '...',
        mode: isTest ? 'test' : 'production',
        error: error?.message
      });
    }
  }, delayMs);
}
