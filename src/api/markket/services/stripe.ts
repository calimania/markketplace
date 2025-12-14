/**
 * markket.stripe core service
 *
 * Stripe client initialization, configuration, and payment operations
 * Supports both live and test mode param switching when ENV vars are present
 *
 * Key Features:
 *
 * - Defensive client initialization (null if keys missing)
 * - Environment-based fee configuration
 * - Store-level fee overrides via settings
 * - Type-safe payment link creation
 * - Webhook signature verification
 *
 * @module services/stripe
 * @requires stripe
 * @requires ./stripe-connect
 *
 * Environment Variables:
 * - STRIPE_SECRET_KEY: Production Stripe secret key
 * - STRIPE_SECRET_KEY_TEST: Test mode Stripe secret key
 * - STRIPE_WEBHOOK_SECRET: Production webhook secret
 * - STRIPE_WEBHOOK_SECRET_TEST: Test webhook secret
 * - STRIPE_PERCENTAGE_FEE: Platform fee percentage (default: 3.3)
 * - STRIPE_BASE_FEE: Platform fee fixed amount in dollars (default: 0.33)
 * - STRIPE_MAX_APPLICATION_FEE: Fee cap in dollars (default: 99.99)
 * - STRIPE_PROCESSING_PERCENT: Stripe processing % for estimates (default: 2.9)
 * - STRIPE_PROCESSING_FIXED: Stripe processing fixed amount in cents (default: 0.30)
 */

import Stripe from "stripe";
import {
  buildConnectPaymentLink,
  type StoreConnectData
} from './stripe-connect';

/**
 * Parse and validate Stripe secret keys from environment
 * @constant {string}
 */
const RAW_STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const RAW_STRIPE_SECRET_TEST_KEY = process.env.STRIPE_SECRET_TEST_KEY || '';

/**
 * Webhook signature secrets for verification
 * @constant {string}
 */
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_WEBHOOK_SECRET_TEST = process.env.STRIPE_WEBHOOK_SECRET_TEST || '';

/**
 * Platform fee configuration (fees collected by platform, not by Stripe)
 * These are application_fee_amount values sent to Stripe Connect
 *
 * @constant {number} DEFAULT_PERCENT_FEE - Percentage fee as number (e.g., 3.3 = 3.3%)
 * @constant {number} DEFAULT_BASE_FEE_CENTS - Fixed fee in cents (e.g., 33 = $0.33)
 * @constant {number} DEFAULT_MAX_APP_FEE_CENTS - Maximum fee cap in cents
 */
const DEFAULT_PERCENT_FEE = parseFloat(process.env.STRIPE_PERCENTAGE_FEE || '3.3');
const DEFAULT_BASE_FEE_CENTS = Math.round(parseFloat(process.env.STRIPE_BASE_FEE || '0.33') * 100);
const DEFAULT_MAX_APP_FEE_CENTS = Math.round(parseFloat(process.env.STRIPE_MAX_APPLICATION_FEE || '99.99') * 100);

/**
 * Stripe's own processing fees (used for informational net payout estimates only)
 * NOT charged by this platform - included for transparent calculations
 *
 * NOTE: This is an ESTIMATE using standard US domestic rates.
 * Actual fees vary by:
 * - Card type (credit vs debit)
 * - Card origin (domestic vs international)
 * - Business category and risk level
 * - Payment method and region
 *
 * Standard rate: 2.9% + $0.30 (US domestic cards)
 * International cards can be 3.9% + $0.30 or higher
 *
 * For accurate fees, check Stripe Dashboard → Reports → Payouts
 * or use Stripe Balance Transactions API after payment settles
 * https://stripe.com/docs/api/balance_transactions
 * https://stripe.com/pricing
 *
 * @constant {number} STRIPE_PROCESSING_PERCENT - Estimated percentage (3.5% average)
 * @constant {number} STRIPE_PROCESSING_FIXED_CENTS - Estimated fixed fee in cents ($0.30)
 */
const STRIPE_PROCESSING_PERCENT = parseFloat(process.env.STRIPE_PROCESSING_PERCENT || '2.9');
const STRIPE_PROCESSING_FIXED_CENTS = Math.round(parseFloat(process.env.STRIPE_PROCESSING_FIXED || '0.30') * 100);

/**
 * Create a Stripe client with defensive null handling
 *
 * Avoids constructing Stripe client with empty/invalid keys which would fail later
 * Returns null if key is empty, allowing graceful degradation
 *
 * @param {string} secret - Stripe API secret key
 * @returns {Stripe | null} Initialized Stripe client or null if key missing
 * @example
 * const client = createStripeClient(process.env.STRIPE_SECRET_KEY);
 * if (!client) {
 *   console.error('Stripe not configured');
 *   return null;
 * }
 */
function createStripeClient(secret: string): Stripe | null {
  if (!secret) return null;
  return new Stripe(secret, {
    apiVersion: '2024-06-20',
    typescript: true,
    telemetry: false,
  });
}

/**
 * Stripe clients for production and test modes
 * @constant {Stripe | null} stripe - Production Stripe client
 * @constant {Stripe | null} stripeTest - Test mode Stripe client
 */
const stripe = createStripeClient(RAW_STRIPE_SECRET_KEY);
const stripeTest = createStripeClient(RAW_STRIPE_SECRET_TEST_KEY);

/**
 * Fee configuration interface
 * @typedef {Object} FeeConfig
 * @property {number} percentFeeDecimal - Percentage as decimal (0.033 = 3.3%)
 * @property {number} baseFeeCents - Fixed fee in cents
 * @property {number} maxAppFeeCents - Maximum fee cap in cents
 */
interface FeeConfig {
  percentFeeDecimal: number;
  baseFeeCents: number;
  maxAppFeeCents: number;
}

/**
 * Line item input for price/product data
 * @typedef {Object} LineItemInput
 * @property {string} [price] - Stripe Price ID (if using existing price)
 * @property {string} [product] - Stripe Product ID (if creating new price)
 * @property {number} [unit_amount] - Unit amount in dollars (converted to cents)
 * @property {number} [quantity] - Quantity of items
 * @property {string} [Name] - Display name for the product
 */
interface LineItemInput {
  price?: string;
  product?: string;
  unit_amount?: number;
  quantity?: number;
  Name?: string;
}

/**
 * Payment link creation parameters
 * @typedef {Object} PaymentLinkOptions
 * @property {LineItemInput[]} prices - Array of price/product items
 * @property {boolean} include_shipping - Whether to collect shipping address
 * @property {boolean} stripe_test - Use test mode client
 * @property {string} [store_id] - Store document ID for Stripe Connect
 * @property {string} [redirect_to_url] - Custom redirect URL after payment
 * @property {number} [total] - Total amount in dollars
 * @property {{}} [product] - (product::product)
 */
type PaymentLinkOptions = {
  prices: LineItemInput[];
  include_shipping: boolean;
  stripe_test: boolean;
  store_id?: string;
  redirect_to_url?: string;
  total?: number;
  product?: {
    documentId: string;
    Name: string;
    PRICES: [any];
    SKU: string;
  };
};

/**
 * Retrieve connected Stripe account information
 *
 * Fetches account details for a store's connected Stripe account
 * Falls back to test client if production account is in test mode
 *
 * @async
 * @param {string} store_id - Store document ID
 * @returns {Promise<Stripe.Account | null>} Account details or null
 * @throws {Error} Logs error but doesn't throw - returns null on failure
 * @example
 * const account = await getAccount(storeId);
 * if (account?.charges_enabled) {
 *   console.log('Account ready for payments');
 * }
 */
export const getAccount = async (store_id: string): Promise<Stripe.Account | null> => {
  if (!store_id) {
    return null;
  }

  const store = await strapi.db.query('api::store.store').findOne({
    where: {
      documentId: store_id,
    },
  });

  const connected_account_id = store?.STRIPE_CUSTOMER_ID;
  if (!connected_account_id) {
    return null;
  }

  let account;
  try {
    account = await stripe?.accounts.retrieve(connected_account_id);
  } catch (error) {
    console.error('[STRIPE_SERVICE] Error retrieving account:', error?.message);
    if (error?.raw?.message.includes('testmode')) {
      account = await stripeTest?.accounts.retrieve(connected_account_id);
      account.test_mode = true;
    }
  }

  return account;
};

/**
 * Validate payment link input parameters
 * @param {PaymentLinkOptions} options - Payment link configuration
 * @returns {Object} Validation result with errors
 * @private
 */
function validatePaymentLinkInput(options: PaymentLinkOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(options.prices) || options.prices.length === 0) {
    errors.push('At least one price item is required');
  }

  if (typeof options.total !== 'number' || options.total <= 0) {
    errors.push('Total must be a positive number');
  }

  if (options.store_id && typeof options.store_id !== 'string') {
    errors.push('Store ID must be a valid string');
  }

  if (options.redirect_to_url && typeof options.redirect_to_url !== 'string') {
    errors.push('Redirect URL must be a valid string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a Stripe payment link with automatic fee calculation
 *
 * Main entry point for payment link creation. Handles both:
 * 1. Standard payment links (no Stripe Connect)
 * 2. Connect payment links (with platform fee and transfer to seller)
 *
 * Flow:
 * 1. Validate Stripe client is available
 * 2. Build and validate line items
 * 3. Fetch store and settings (for fee overrides)
 * 4. Build redirect URL
 * 5. Route to appropriate handler (standard or Connect)
 *
 * Fee calculation cascade:
 * - ENV variables → default fees
 * - Store settings['payouts:stripe'] → override defaults
 * - Final fees: (total × percentage) + base, capped at max
 *
 * @async
 * @param {PaymentLinkOptions} options - Payment link configuration
 * @returns {Promise<Stripe.PaymentLink | null>} Payment link or null on error
 * @example
 * const link = await createPaymentLinkWithPriceIds({
 *   prices: [{ price: 'price_123', quantity: 1 }],
 *   include_shipping: true,
 *   stripe_test: false,
 *   store_id: 'store_doc_123',
 *   total: 99.99
 * });
 *
 * @see buildConnectPaymentLink For Connect-specific implementation
 * @see createStandardPaymentLink For standard payment link implementation
 */
export const createPaymentLinkWithPriceIds = async ({
  prices,
  include_shipping,
  stripe_test,
  store_id,
  redirect_to_url,
  total,
  product,
}: PaymentLinkOptions): Promise<{ link: Stripe.PaymentLink | null, details: {}[], feeInfo?: any }> => {
  const validation = validatePaymentLinkInput({
    prices,
    include_shipping,
    stripe_test,
    store_id,
    redirect_to_url,
    total,
    product,
  });

  const details = prices.map((price: any) => {
    // @TODO: review, working with elements present in the current client implementations
    const _price = product.PRICES?.find((p: { Name: string, }) => (p.Name === price.Name));

    return {
      Name: `${product?.Name} - ${_price?.Name || price?.Name}`,
      product: product.documentId,
      Quantity: parseInt(price.quantity || '0', 10),
      Unit_Price: parseFloat(_price?.Price || price.unit_amount || '0'),
      Total_Price: parseFloat(_price?.Price || price.unit_amount || '0') * parseFloat(price.quantity || '0'),
      Short_description: _price?.Description || price?.Name || product?.Name || 'created with stripe link',
      Stripe_price_id: _price?.STRIPE_ID || '',
      Stripe_product_id: product.SKU || '',
      Currency: price.Currency || 'USD',
    };
  });

  if (!validation.valid) {
    console.error('[STRIPE_SERVICE] Invalid payment link input:', validation.errors);
    return null;
  }

  const client = stripe_test ? stripeTest : stripe;

  if (!client) {
    console.error('[STRIPE_SERVICE] No Stripe client available');
    return null;
  }

  const lineItems = buildLineItems(prices);
  if (lineItems.length === 0) {
    console.warn('[STRIPE_SERVICE] No valid line items to process');
    return null;
  }

  console.log('[STRIPE_SERVICE] Line items built', {
    count: lineItems.length,
    items: lineItems.map((item: any) => ({
      has_price_id: !!item.price,
      has_price_data: !!item.price_data,
      unit_amount: item.price_data?.unit_amount || 'N/A',
      quantity: item.quantity,
      line_total_cents: ((item.price_data?.unit_amount || 0) * (item.quantity || 1)),
      line_total_usd: (((item.price_data?.unit_amount || 0) * (item.quantity || 1)) / 100).toFixed(2),
    })),
  });

  let store: StoreConnectData | null = null;
  if (store_id) {
    try {
      store = await strapi.documents('api::store.store').findOne({
        documentId: store_id,
        populate: ['settings'],
      });

    } catch (error) {
      console.error('[STRIPE_SERVICE] Store fetch failed:', error?.message);
      return null;
    }

    if (!store) {
      console.error('[STRIPE_SERVICE] Store not found');
      return null;
    }
  }

  const baseUrl = redirect_to_url || (store?.slug ? `https://de.markket.place/store/${store.slug}/receipt` : 'https://markket.place/receipt');
  const redirectUrl = `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`;

  // default payment link with no connected account
  if (!store?.STRIPE_CUSTOMER_ID) {
    const link = await createStandardPaymentLink(client, lineItems, redirectUrl, include_shipping);
    return {
      link,
      details,
    }
  }

  const totalCents = Math.round((total || 0) * 100);

  console.log('[STRIPE_SERVICE] fee calculation', {
    input_total: total,
    input_total_type: typeof total,
    calculated_cents: totalCents,
    calculated_usd: (totalCents / 100).toFixed(2),
    line_items_total_cents: lineItems.reduce((sum: number, item: any) => {
      const itemTotal = (item.price_data?.unit_amount || 0) * (item.quantity || 1);
      return sum + itemTotal;
    }, 0),
    mismatch: totalCents !== lineItems.reduce((sum: number, item: any) => sum + ((item.price_data?.unit_amount || 0) * (item.quantity || 1)), 0) ? 'MISMATCH DETECTED' : 'OK',
  });

  // --- NEW: Get feeInfo from buildConnectPaymentLink and return it for order.extra ---
  const connectResult = await buildConnectPaymentLink({
    client,
    connectedAccountId: store.STRIPE_CUSTOMER_ID,
    lineItems,
    redirectUrl,
    totalCents,
    store: store as any,
    includeShipping: include_shipping,
    defaultFeeConfig: {
      percentFeeDecimal: DEFAULT_PERCENT_FEE / 100,
      baseFeeCents: DEFAULT_BASE_FEE_CENTS,
      maxAppFeeCents: DEFAULT_MAX_APP_FEE_CENTS,
    },
    stripeProcessingFees: {
      percentFeeDecimal: STRIPE_PROCESSING_PERCENT / 100,
      fixedCents: STRIPE_PROCESSING_FIXED_CENTS,
    }
  });

  return {
    link: connectResult?.link || null,
    details,
    feeInfo: connectResult?.feeInfo, // <-- Save this to order.extra when creating the order
  };
};

/**
 * Convert price/product array to Stripe LineItem format
 *
 * Validates and transforms input prices into Stripe PaymentLink line items.
 * Supports both:
 * - Existing Stripe prices: { price: 'price_123', quantity: 1 }
 * - Dynamic pricing: { product: 'prod_123', unit_amount: 10.00, quantity: 1 }
 *
 * @param {LineItemInput[]} prices - Array of price/product inputs
 * @returns {Stripe.PaymentLinkCreateParams.LineItem[]} Formatted line items (max 20)
 * @private
 */
function buildLineItems(prices: LineItemInput[]): Stripe.PaymentLinkCreateParams.LineItem[] {
  const lineItems: Stripe.PaymentLinkCreateParams.LineItem[] = [];

  for (const price of prices) {
    if (price.price) {
      lineItems.push({
        price: price.price,
        quantity: price.quantity || 1,
      });
    } else if (price.product && price.unit_amount) {
      lineItems.push(({
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(price.unit_amount * 100),
          product_data: {
            name: price.Name || 'Product',
          },
        },
        quantity: price.quantity || 1,
      } as unknown) as Stripe.PaymentLinkCreateParams.LineItem);
    }
  }

  return lineItems.slice(0, 20); // ✅ FIXED: Use slice() not splice()
}

/**
 * Create a standard Stripe payment link (no Connect)
 *
 * Used when seller doesn't have a Stripe Connect account.
 * All payments go directly to platform account.
 *
 * @async
 * @param {Stripe} client - Stripe client instance
 * @param {Stripe.PaymentLinkCreateParams.LineItem[]} lineItems - Formatted line items
 * @param {string} redirectUrl - URL for post-payment redirect
 * @param {boolean} includeShipping - Whether to collect shipping address
 * @returns {Promise<Stripe.PaymentLink | null>} Created payment link or null
 * @private
 */
async function createStandardPaymentLink(
  client: Stripe,
  lineItems: Stripe.PaymentLinkCreateParams.LineItem[],
  redirectUrl: string,
  includeShipping: boolean
): Promise<Stripe.PaymentLink | null> {
  const params: Stripe.PaymentLinkCreateParams = {
    line_items: lineItems,
    after_completion: {
      type: 'redirect',
      redirect: { url: redirectUrl },
    },
  };

  if (includeShipping) {
    params.shipping_address_collection = {
      allowed_countries: ['US', 'CO', 'MX', 'SV', 'IL'],
    };
  }

  try {
    return await client.paymentLinks.create(params);
  } catch (error) {
    console.error('[STRIPE_SERVICE] Standard payment link creation failed:', error?.message);
    return null;
  }
}

/**
 * Retrieve a checkout session by ID
 *
 * Fetches full session details including line items, customer info, and payment status.
 * Supports both test and production sessions.
 *
 * @async
 * @param {string} session_id - Stripe checkout session ID
 * @param {boolean} stripe_test - Whether to use test client
 * @returns {Promise<Stripe.Checkout.Session | null>} Session details or null
 * @example
 * const session = await getSessionById('cs_test_123', true);
 * console.log('Payment status:', session?.payment_status);
 */
export const getSessionById = async (
  session_id: string,
  stripe_test: boolean
): Promise<Stripe.Checkout.Session | null> => {
  if (!session_id) {
    return null;
  }

  const client = stripe_test ? stripeTest : stripe;

  if (!client) {
    console.error('[STRIPE_SERVICE] No Stripe client available');
    return null;
  }

  try {
    return await client.checkout.sessions.retrieve(session_id);
  } catch (error) {
    console.error('[STRIPE_SERVICE] Session retrieval failed:', error?.message);
    return null;
  }
};

/**
 * Verify Stripe webhook signature
 *
 * Validates webhook authenticity using Stripe's official signature verification.
 * Prevents replay attacks and ensures webhook originated from Stripe.
 *
 * Implementation follows Stripe's security best practices:
 * - Uses constructEvent for proper verification
 * - Handles both signed and unsigned requests gracefully
 * - Returns null on any verification failure
 *
 * @param {string} signature - Stripe-Signature header value
 * @param {string | Buffer} payload - Raw webhook body (unparsed)
 * @param {boolean} [test=true] - Use test webhook secret
 * @returns {Stripe.Event | null} Verified event object or null if invalid
 * @example
 * const event = verifyStripeWebhook(signature, rawBody, false);
 * if (event?.type === 'payment_intent.succeeded') {
 *   // Handle successful payment
 * }
 *
 * @see https://stripe.com/docs/webhooks/signatures
 */
export const verifyStripeWebhook = (signature: string, payload: string | Buffer, test: boolean = true): any => {
  const secret = test ? STRIPE_WEBHOOK_SECRET_TEST : STRIPE_WEBHOOK_SECRET;
  const client = test ? stripeTest : stripe;

  // ✅ KEEP secrets configured for security
  if (!secret || !signature || !payload || !client) {
    console.warn('[STRIPE_SERVICE] Verification failed - missing components');
    return null;
  }

  try {
    return client.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    // This will fail for charge.succeeded due to rawBody issue
    // BUT checkout.session.completed still works
    // AND deferred retrieval ensures you get fees anyway
    console.error('[STRIPE_SERVICE] Webhook verification error:', error?.message);
    return null;
  }
};

/**
 * Validate Stripe configuration on startup
 * Logs warnings if critical environment variables are missing
 *
 * @returns {Object} Configuration status
 */
export function validateStripeConfig(): { configured: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!RAW_STRIPE_SECRET_KEY && !RAW_STRIPE_SECRET_TEST_KEY) {
    warnings.push('No Stripe keys configured - payments will fail');
  }

  if (!RAW_STRIPE_SECRET_KEY) {
    warnings.push('STRIPE_SECRET_KEY not set - production payments disabled');
  }

  if (!RAW_STRIPE_SECRET_TEST_KEY) {
    warnings.push('STRIPE_SECRET_TEST_KEY not set - test payments disabled');
  }

  if (!STRIPE_WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
    warnings.push('STRIPE_WEBHOOK_SECRET not set - webhooks will fail in production');
  }

  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(`[STRIPE_SERVICE] ⚠️ ${w}`));
  }

  return {
    configured: !!(stripe || stripeTest),
    warnings,
  };
}

/**
 * Get appropriate Stripe client (production or test)
 *
 * @param {boolean} [test=false] - Use test client
 * @returns {Stripe | null} Stripe client or null if not configured
 * @example
 * const client = getStripeClient(false);
 * if (client) {
 *   const txns = await client.balanceTransactions.list(...);
 * }
 */
export function getStripeClient(test: boolean = false): Stripe | null {
  return test ? stripeTest : stripe;
}

if (process.env.NODE_ENV !== 'test') {
  const config = validateStripeConfig();
  console.log(`[STRIPE_SERVICE] Configuration status: ${config.configured ? '✅ Ready' : '⚠️ Degraded'}`);
}
