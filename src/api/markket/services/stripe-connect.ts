/**
 * markket.stripe-connect service
 *
 * Specialized service for Stripe Connect operations
 * Handles multi-party transactions where platform collects fees and transfers remainder to seller
 *
 * Key Responsibilities:
 * - Account validation (charges_enabled check)
 * - Fee calculation (platform fees, Stripe processing fees)
 * - Store settings overrides (per-store customizable fees)
 * - Payment link creation with proper Connect setup
 * - Net payout estimation for transparency
 *
 * Architecture:
 * - separates Connect concerns from core Stripe service
 * - Pure fee calculation functions (testable, reusable)
 * - Comprehensive logging with financial breakdown
 *
 * @module services/stripe-connect
 * @requires stripe
 *
 * Fee Flow:
 * 1. Get defaults from ENV variables
 * 2. Override with store.settings['payouts:stripe'] if present
 * 3. Calculate: (total × percentage) + base, capped at max
 * 4. Apply application_fee_amount + transfer_data to payment link
 * 5. Stripe deducts its fees, transfers remainder to seller
 *
 * Example Flow:
 * - Customer pays $100
 * - Platform fee: ($100 × 3.3%) + $0.33 = $3.63
 * - Stripe fee: ($100 × 2.9%) + $0.30 = $3.20
 * - Seller net: $100 - $3.63 - $3.20 = $93.17
 */

import Stripe from 'stripe';
import {
  calculateFee,
  TransactionType,
  getFeeBreakdown,
} from './stripe-fees';

/**
 * Fee configuration interface
 * @typedef {Object} ConnectFeeConfig
 * @property {number} percentFeeDecimal - Percentage as decimal (0.033 = 3.3%)
 * @property {number} baseFeeCents - Fixed fee in cents (33 = $0.33)
 * @property {number} [feeMinimumCents] - Minimum fee floor in cents (optional)
 * @property {number} maxAppFeeCents - Maximum fee cap in cents (9999 = $99.99)
 */
interface ConnectFeeConfig {
  percentFeeDecimal: number;
  baseFeeCents: number;
  feeMinimumCents?: number;
  maxAppFeeCents: number;
}

/**
 * Store data with settings for fee overrides
 *
 * @typedef {Object} StoreConnectData
 * @property {string} documentId - Unique store identifier
 * @property {string} [STRIPE_CUSTOMER_ID] - Connected account ID
 * @property {string} [slug] - URL-friendly identifier
 * @property {Object} [settings] - Store configuration with meta
 * @property {Object} [settings.meta] - Store metadata
 * @property {Object} [settings.meta['payouts:stripe']] - Stripe payout settings
 */
export interface StoreConnectData {
  documentId: string;
  STRIPE_CUSTOMER_ID?: string;
  slug?: string;
  settings?: {
    meta?: {
      'payouts:stripe'?: {
        percentage_fee?: number;
        base_fee?: number;
        max_application_fee?: number;
      };
    };
  } | any;
}

/**
 * Connect payment link creation options
 *
 * @typedef {Object} ConnectPaymentLinkOptions
 * @property {Stripe} client - Stripe client instance
 * @property {string} connectedAccountId - Seller's connected account ID
 * @property {Stripe.PaymentLinkCreateParams.LineItem[]} lineItems - Products to charge
 * @property {string} redirectUrl - Post-payment redirect URL
 * @property {number} totalCents - Total charge in cents
 * @property {StoreConnectData} store - Store object with settings
 * @property {boolean} [includeShipping=false] - Collect shipping address
 * @property {ConnectFeeConfig} [defaultFeeConfig] - Default fee configuration
 * @property {Object} [stripeProcessingFees] - Stripe's own fee for estimates
 * @property {number} [stripeProcessingFees.percentFeeDecimal] - Stripe % as decimal
 * @property {number} [stripeProcessingFees.fixedCents] - Stripe fixed fee in cents
 * @property {TransactionType} [transactionType] - Type of transaction for fee calculation
 */
interface ConnectPaymentLinkOptions {
  client: Stripe;
  connectedAccountId: string;
  lineItems: Stripe.PaymentLinkCreateParams.LineItem[];
  redirectUrl: string;
  totalCents: number;
  store: StoreConnectData | any;
  includeShipping?: boolean;
  defaultFeeConfig?: ConnectFeeConfig;
  stripeProcessingFees?: {
    percentFeeDecimal: number;
    fixedCents: number;
  };
  transactionType?: TransactionType;
}

/**
 * Validate connected account can accept charges
 *
 * Critical security check before creating payment links.
 * Ensures:
 * - Account exists and is retrievable
 * - Account has charges_enabled (verified bank account, etc.)
 *
 * @async
 * @param {Stripe} client - Stripe client instance
 * @param {string} connectedAccountId - Connected account ID to validate
 * @returns {Promise<Stripe.Account | null>} Account object or null if invalid
 * @example
 * const account = await validateConnectAccount(stripe, 'acct_123');
 * if (!account) {
 *   console.error('Account not ready for charges');
 *   return null;
 * }
 */
export async function validateConnectAccount(
  client: Stripe,
  connectedAccountId: string
): Promise<Stripe.Account | null> {
  if (!connectedAccountId || typeof connectedAccountId !== 'string') {
    console.error('[STRIPE_CONNECT] Invalid account ID');
    return null;
  }

  if (!client) {
    console.error('[STRIPE_CONNECT] Stripe client not initialized');
    return null;
  }

  try {
    const account = await client.accounts.retrieve(connectedAccountId);

    if (!account.charges_enabled) {
      console.warn('[STRIPE_CONNECT] Account charges not enabled', {
        account_id: connectedAccountId,
        charges_enabled: account.charges_enabled,
      });
      return null;
    }

    return account;
  } catch (error) {
    console.error('[STRIPE_CONNECT] Account retrieval failed:', error?.message);
    return null;
  }
}

/**
 * Resolve fee configuration with store settings override
 *
 * Fee configuration cascade:
 * 1. Start with provided defaults
 * 2. Override with store.settings['payouts:stripe'] if present
 * 3. Validate all values are non-negative
 *
 * This allows per-store customization while maintaining sensible defaults.
 *
 * @param {StoreConnectData} store - Store object with optional settings
 * @param {ConnectFeeConfig} defaults - Default fee configuration
 * @returns {ConnectFeeConfig} Resolved configuration with overrides applied
 * @example
 * const config = resolveConnectFeeConfig(store, defaults);
 * console.log(config.percentFeeDecimal); // 0.20 if store overrides with 20%
 */
export function resolveConnectFeeConfig(
  store: StoreConnectData,
  defaults: ConnectFeeConfig
): ConnectFeeConfig {
  let config = { ...defaults };

  const payoutsStripe = store?.settings?.meta?.['payouts:stripe'];

  console.log('[STRIPE_CONNECT] Fee resolution', {
    store_id: store.documentId,
    has_settings: !!store?.settings,
    has_meta: !!store?.settings?.meta,
    has_payouts_stripe: !!payoutsStripe,
    settings_keys: store?.settings ? Object.keys(store.settings) : [],
    meta_keys: store?.settings?.meta ? Object.keys(store.settings.meta) : [],
    payouts_stripe_value: payoutsStripe,
    defaults_being_used: {
      percent: defaults.percentFeeDecimal * 100,
      base: defaults.baseFeeCents / 100,
      minimum: defaults.feeMinimumCents ? (defaults.feeMinimumCents / 100) : 'none',
      max: defaults.maxAppFeeCents / 100,
    }
  });

  if (!payoutsStripe || typeof payoutsStripe !== 'object') {
    console.log('[STRIPE_CONNECT] No store-level fee override, using defaults');
    return config;
  }

  // Override percentage fee
  if (typeof payoutsStripe.percentage_fee === 'number' && payoutsStripe.percentage_fee >= 0) {
    config.percentFeeDecimal = payoutsStripe.percentage_fee / 100;
    console.log('[STRIPE_CONNECT] Override percentage fee:', payoutsStripe.percentage_fee);
  }

  if (typeof payoutsStripe.base_fee === 'number' && payoutsStripe.base_fee >= 0) {
    config.baseFeeCents = Math.round(payoutsStripe.base_fee * 100);
    console.log('[STRIPE_CONNECT] Override base fee:', payoutsStripe.base_fee);
  }

  if (typeof payoutsStripe.fee_minimum === 'number' && payoutsStripe.fee_minimum >= 0) {
    config.feeMinimumCents = Math.round(payoutsStripe.fee_minimum * 100);
    console.log('[STRIPE_CONNECT] Override fee minimum:', payoutsStripe.fee_minimum);
  }

  if (typeof payoutsStripe.max_application_fee === 'number' && payoutsStripe.max_application_fee >= 0) {
    config.maxAppFeeCents = Math.round(payoutsStripe.max_application_fee * 100);
    console.log('[STRIPE_CONNECT] Override max fee:', payoutsStripe.max_application_fee);
  }

  console.log('[STRIPE_CONNECT] Final fee config', {
    percent: config.percentFeeDecimal * 100,
    base: config.baseFeeCents / 100,
    minimum: config.feeMinimumCents ? (config.feeMinimumCents / 100) : 'none',
    max: config.maxAppFeeCents / 100,
  });

  return config;
}

/**
 * Calculate platform application fee
 *
 * Formula: (total × percentage) + base, capped at maximum
 *
 * This fee is charged to the customer and collected by platform.
 * The remainder (after Stripe's fees) goes to seller via transfer_data.
 *
 * Safety checks:
 * - Returns 0 for zero/negative amounts
 * - All calculations use cents to avoid floating point errors
 * - Maximum cap prevents excessive fees
 *
 * @param {number} totalCents - Transaction total in cents
 * @param {ConnectFeeConfig} config - Fee configuration with percent, base, max
 * @returns {number} Calculated application fee in cents
 * @example
 * const fee = calculateApplicationFee(10000, { // $100.00
 *   percentFeeDecimal: 0.033,  // 3.3%
 *   baseFeeCents: 33,          // $0.33
 *   maxAppFeeCents: 9999       // $99.99 cap
 * });
 * console.log(fee); // 3663 cents = $36.63
 */
export function calculateApplicationFee(
  totalCents: number,
  config: ConnectFeeConfig
): number {
  if (!totalCents || totalCents < 0) return 0;

  // Variable portion: percentage of transaction
  const variableFee = Math.round(totalCents * config.percentFeeDecimal);

  // Total application fee: variable + fixed base
  let applicationFee = variableFee + config.baseFeeCents;

  // Apply cap
  if (applicationFee > config.maxAppFeeCents) {
    applicationFee = config.maxAppFeeCents;
  }

  // Apply minimum fee floor if configured
  if (config.feeMinimumCents && applicationFee < config.feeMinimumCents) {
    applicationFee = config.feeMinimumCents;
  }

  return applicationFee;
}

/**
 * Estimate net payout to seller after all fees
 *
 * For transparency and informational purposes only.
 * Shows seller what they'll receive after:
 * 1. Platform application fee
 * 2. Stripe processing fees (2.9% + $0.30 typical)
 *
 * Formula: total - stripe_fee - platform_fee
 *
 * NOTE: This is an estimate. Actual Stripe fees may vary by region/card type.
 * Not sent to Stripe API - used only for reporting.
 *
 * @param {number} totalCents - Transaction total in cents
 * @param {number} applicationFeeCents - Platform application fee in cents
 * @param {number} [stripeFeePercent=2.9] - Stripe's fee percentage
 * @param {number} [stripeFixedCents=30] - Stripe's fixed fee in cents ($0.30)
 * @returns {number} Estimated net payout to seller in cents (minimum 0)
 * @example
 * const net = estimateConnectedAccountNet(
 *   10000,  // $100.00 total
 *   350,    // $3.50 platform fee
 *   2.9,    // Stripe %
 *   30      // Stripe $0.30
 * );
 * console.log(net); // 9350 cents = $93.50 net to seller
 */
export function estimateConnectedAccountNet(
  totalCents: number,
  applicationFeeCents: number,
  stripeFeePercent: number = 2.9,
  stripeFixedCents: number = 30
): number {
  const stripeFee = Math.round(totalCents * (stripeFeePercent / 100)) + stripeFixedCents;
  const connectedAccountNet = totalCents - stripeFee - applicationFeeCents;
  return Math.max(connectedAccountNet, 0);
}

/**
 * Build and create a Stripe Connect payment link
 *
 * When you create a payment link, you should store key fee and payout breakdown info
 * (application fee, estimated Stripe fee, net to seller, config source, etc.)
 * in the order's `extra` field for later reconciliation and audit.
 *
 * Return this info as part of the payment link creation result so the order service/controller
 * can persist it in `order.extra`.
 */
export async function buildConnectPaymentLink(
  options: ConnectPaymentLinkOptions
): Promise<{ link: Stripe.PaymentLink | null, feeInfo: any }> {
  const {
    client,
    connectedAccountId,
    lineItems,
    redirectUrl,
    totalCents,
    store,
    includeShipping = false,
    defaultFeeConfig = { percentFeeDecimal: 0.033, baseFeeCents: 33, maxAppFeeCents: 9999 },
    stripeProcessingFees = { percentFeeDecimal: 0.029, fixedCents: 30 },
    transactionType = TransactionType.PRODUCT,
  } = options;

  const connectedAccount = await validateConnectAccount(client, connectedAccountId);
  if (!connectedAccount) {
    console.error('[STRIPE_CONNECT] Cannot create payment link, account validation failed');
    return { link: null, feeInfo: null };
  }

  // --- FEE CALCULATION LOGIC ---
  // Use cascade: ENV/defaults → store.settings['payouts:stripe'] → final config
  const feeConfig = resolveConnectFeeConfig(store, defaultFeeConfig);
  const applicationFeeAmount = calculateApplicationFee(totalCents, feeConfig);
  const stripePercent = stripeProcessingFees?.percentFeeDecimal ?? 0.029;
  const stripeFixed = stripeProcessingFees?.fixedCents ?? 30;
  const stripeFeeEstimate = Math.round(totalCents * stripePercent) + stripeFixed;
  const breakdown = getFeeBreakdown(totalCents, store, transactionType);

  // Prepare fee info for order.extra
  const feeInfo = {
    application_fee_cents: applicationFeeAmount,
    application_fee_usd: (applicationFeeAmount / 100).toFixed(2),
    stripe_fee_estimate_cents: stripeFeeEstimate,
    stripe_fee_estimate_usd: (stripeFeeEstimate / 100).toFixed(2),
    net_to_seller_cents: totalCents - applicationFeeAmount - stripeFeeEstimate,
    net_to_seller_usd: ((totalCents - applicationFeeAmount - stripeFeeEstimate) / 100).toFixed(2),
    config_source: store?.settings?.meta?.['payouts:stripe'] ? 'store-override' : 'env-defaults',
    fee_config: feeConfig,
    stripe_processing_fees: { percent: stripePercent, fixed: stripeFixed },
    breakdown,
  };

  console.log('[STRIPE_CONNECT] Fee breakdown - Transaction Analysis', {
    transaction_usd: breakdown.transaction_total_usd,
    platform_fee: {
      percentage_rate: breakdown.percentage_rate,
      percentage_calc: breakdown.percentage_calc_usd,
      base_fee: breakdown.base_fee_usd,
      before_minimum: breakdown.base_plus_percentage_usd,
      final: breakdown.final_platform_fee_usd,
      final_percent_of_transaction: breakdown.final_platform_fee_percent,
      minimum_applied: breakdown.minimum_applied,
    },
    // Stripe's fees (informational - estimated, using stripeProcessingFees)
    stripe_fees_estimate: {
      note: 'Estimate only - actual varies by card type',
      percent_rate: (stripePercent * 100).toFixed(2) + '%',
      fixed: `$${(stripeFixed / 100).toFixed(2)}`,
      estimated_total: (stripeFeeEstimate / 100).toFixed(2)
    },
    total_fees: {
      platform_plus_stripe_estimate: (
        (applicationFeeAmount + stripeFeeEstimate) / 100
      ).toFixed(2),
      seller_receives: (
        (totalCents - applicationFeeAmount - stripeFeeEstimate) / 100
      ).toFixed(2),
      seller_net_percent: (
        ((totalCents - applicationFeeAmount - stripeFeeEstimate) / totalCents) * 100
      ).toFixed(2),
    },
    config_source: store?.settings?.meta?.['payouts:stripe'] ? 'store-override' : 'env-defaults',
    store_tier: breakdown.store_tier,
  });

  const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
    line_items: lineItems,
    after_completion: {
      type: 'redirect',
      redirect: { url: redirectUrl },
    },
    application_fee_amount: applicationFeeAmount,
    transfer_data: { destination: connectedAccountId },
  };

  if (includeShipping) {
    paymentLinkParams.shipping_address_collection = {
      allowed_countries: ['US', 'CO', 'MX', 'SV', 'IL'],
    };
  }

  console.log('[STRIPE_CONNECT] Sending to Stripe', {
    application_fee_amount: applicationFeeAmount,
    application_fee_usd: (applicationFeeAmount / 100).toFixed(2),
    line_items_count: lineItems.length,
    line_items_total_cents: lineItems.reduce((sum: number, item: any) => {
      if (item.price_data) {
        return sum + (item.price_data.unit_amount * (item.quantity || 1));
      }
      return sum;
    }, 0),
    has_transfer_data: !!paymentLinkParams.transfer_data,
    connected_account: connectedAccountId,
  });

  try {
    const paymentLink = await client.paymentLinks.create(paymentLinkParams);

    console.log('[STRIPE_CONNECT] Payment link created at Stripe', {
      link_id: paymentLink.id,
      link_url: paymentLink.url.substring(0, 60) + '...',
      line_items_data: paymentLink.line_items?.data?.map((item: Stripe.LineItem) => ({
        id: item.id,
        price: item.price?.id,
        quantity: item.quantity,
        amount_total: item.amount_total,
      })),
      breakdown,
    });

    // Return both the link and feeInfo for order creation
    return { link: paymentLink, feeInfo };
  } catch (error) {
    console.error('[STRIPE_CONNECT] Payment link creation failed:', error?.message);
    console.error('[STRIPE_CONNECT] Stripe error details:', {
      type: error?.type,
      code: error?.code,
      param: error?.param,
      message: error?.message,
    });
    return { link: null, feeInfo };
  }
}
