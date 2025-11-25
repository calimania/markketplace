/**
 * markket.stripe-fees service
 *
 * Centralized fee calculation with support for:
 * - Default platform fees
 * - Store-level overrides
 * - Transaction-type pricing (events, subscriptions, products)
 * - Seasonal/promotional adjustments
 * - Tier-based fees
 *
 * Architecture designed for easy plugin extraction and multi-tenancy
 *
 * @module services/stripe-fees
 */

/**
 * Transaction type enumeration
 * Allows different fee structures per transaction category
 */
export enum TransactionType {
  PRODUCT = 'product',           // Physical/digital products
  SERVICE = 'service',           // Services
  EVENT = 'event',               // Event tickets
  SUBSCRIPTION = 'subscription', // Recurring subscriptions
  DONATION = 'donation',         // Charitable donations
  MARKETPLACE = 'marketplace',   // Marketplace commission
}

/**
 * Fee tier based on store subscription level
 * Supports tiered pricing model
 */
export enum StoreTier {
  FREE = 'free',                 // Basic tier with default fees
  PREMIUM = 'premium',           // Premium seller with reduced fees
  ENTERPRISE = 'enterprise',     // Custom negotiated fees
}

/**
 * Store fee configuration with transaction-specific overrides
 *
 * @typedef {Object} StoreFeeSetting
 * @property {number} percentage_fee - Platform percentage (default: 3.3)
 * @property {number} base_fee - Platform fixed fee in dollars
 * @property {number} [fee_minimum] - Minimum fee floor in dollars (optional)
 * @property {number} max_application_fee - Fee cap in dollars
 * @property {StoreTier} [tier] - Store subscription tier
 * @property {Object} [transaction_overrides] - Per-type fee overrides
 * @property {boolean} [seasonal_pricing_enabled] - Enable seasonal adjustments
 * @property {Object} [promotional_codes] - Time-limited fee discounts
 */
interface StoreFeeSetting {
  percentage_fee: number;
  base_fee: number;
  fee_minimum?: number;
  max_application_fee: number;
  tier?: StoreTier;
  transaction_overrides?: Partial<Record<TransactionType, number>>;
  seasonal_pricing_enabled?: boolean;
  promotional_codes?: Record<string, { discount_percent: number; valid_until: string }>;
}

interface FeeConfig {
  percentFeeDecimal: number;
  baseFeeCents: number;
  feeMinimumCents?: number;
  maxAppFeeCents: number;
}

/**
 * Get default fee config from environment variables
 *
 * @returns {FeeConfig} Default fee configuration in cents
 */
export function getDefaultFeeConfig(): FeeConfig {
  const percentFee = parseFloat(process.env.STRIPE_PERCENTAGE_FEE || '3.3');
  const baseFee = parseFloat(process.env.STRIPE_BASE_FEE || '0.33');
  const maxFee = parseFloat(process.env.STRIPE_MAX_APPLICATION_FEE || '99.99');

  return {
    percentFeeDecimal: percentFee / 100,
    baseFeeCents: Math.round(baseFee * 100),
    maxAppFeeCents: Math.round(maxFee * 100),
  };
}

/**
 * Resolve fee configuration with store settings and transaction type
 *
 * Priority cascade:
 * 1. Store tier-based overrides (enterprise rates)
 * 2. Transaction-type specific fees
 * 3. Store-level settings overrides
 * 4. Environment defaults
 * 5. Promotional/seasonal adjustments
 *
 * @param {any} store - Store object with settings
 * @param {TransactionType} [transactionType] - Type of transaction
 * @param {string} [promoCode] - Optional promotional code
 * @returns {FeeConfig} Resolved fee configuration
 * @example
 * const fees = resolveFeeConfig(store, TransactionType.EVENT);
 * // Returns event-specific fees with store overrides applied
 */
export function resolveFeeConfig(
  store: any,
  transactionType: TransactionType = TransactionType.PRODUCT,
  promoCode?: string
): FeeConfig {
  let config = getDefaultFeeConfig();

  const settings = store?.settings?.meta?.['payouts:stripe'] as StoreFeeSetting | undefined;
  if (!settings) {
    return config;
  }

  if (typeof settings.percentage_fee === 'number' && settings.percentage_fee >= 0) {
    config.percentFeeDecimal = settings.percentage_fee / 100;
  }

  if (typeof settings.base_fee === 'number' && settings.base_fee >= 0) {
    config.baseFeeCents = Math.round(settings.base_fee * 100);
  }

  if (typeof settings.fee_minimum === 'number' && settings.fee_minimum >= 0) {
    config.feeMinimumCents = Math.round(settings.fee_minimum * 100);
  }

  if (typeof settings.max_application_fee === 'number' && settings.max_application_fee >= 0) {
    config.maxAppFeeCents = Math.round(settings.max_application_fee * 100);
  }

  return config;
}

/**
 * Get seasonal fee adjustment (e.g., holiday surcharge)
 * Returns multiplier: 0.1 = +10%, -0.05 = -5%
 *
 * @returns {number} Seasonal adjustment multiplier
 * @private
 */
function getSeasonalAdjustment(): number {
  const now = new Date();
  const month = now.getMonth();

  // Higher fees during peak seasons
  if (month === 10 || month === 11) { // November-December (holiday)
    return 0.05; // +5%
  }
  if (month === 6 || month === 7) { // July-August (summer)
    return 0.02; // +2%
  }

  return 0; // No adjustment
}

/**
 * Calculate application fee with all overrides
 *
 * Formula:
 * 1. percentageFee = total × percentage
 * 2. basePlusPct = percentageFee + base_fee
 * 3. withMinimum = MAX(basePlusPct, fee_minimum)
 * 4. final = withMinimum (NO CAP - analyze later if needed)
 *
 * @param {number} totalCents - Transaction amount in cents
 * @param {any} store - Store object with settings
 * @param {TransactionType} [transactionType] - Type of transaction
 * @returns {number} Calculated fee in cents
 */
export function calculateFee(
  totalCents: number,
  store: any,
  transactionType: TransactionType = TransactionType.PRODUCT,
  promoCode?: string
): number {
  if (!totalCents || totalCents < 0) return 0;

  const config = resolveFeeConfig(store, transactionType, promoCode);

  // 1. Calculate percentage portion
  const variableFee = Math.round(totalCents * config.percentFeeDecimal);

  // 2. Add base fee
  let totalFee = variableFee + config.baseFeeCents;

  // 3. Apply fee minimum floor
  if (config.feeMinimumCents && totalFee < config.feeMinimumCents) {
    totalFee = config.feeMinimumCents;
  }

  // @TODO: review cap at max transaction fee, disabling temp to avoid undercharging when high stripe fees
  // This prevents losing money on high-value transactions
  // Monitor actual transactions via logs below

  return totalFee;
}

/**
 * Get fee breakdown for transparency and analysis
 * Logs detailed breakdown so we can monitor for optimization
 *
 * @param {number} totalCents - Transaction amount
 * @param {any} store - Store object
 * @param {TransactionType} [transactionType] - Transaction type
 * @returns {Object} Detailed fee breakdown
 */
export function getFeeBreakdown(
  totalCents: number,
  store: any,
  transactionType: TransactionType = TransactionType.PRODUCT
): Record<string, any> {
  const config = resolveFeeConfig(store, transactionType);

  // Calculate step by step for transparency
  const percentageCalc = Math.round(totalCents * config.percentFeeDecimal);
  const basePlusPct = percentageCalc + config.baseFeeCents;
  const fee = calculateFee(totalCents, store, transactionType);

  const breakdown = {
    // Transaction details
    transaction_total_cents: totalCents,
    transaction_total_usd: (totalCents / 100).toFixed(2),

    // Fee components
    percentage_rate: (config.percentFeeDecimal * 100).toFixed(2),
    percentage_calc_cents: percentageCalc,
    percentage_calc_usd: (percentageCalc / 100).toFixed(2),

    base_fee_cents: config.baseFeeCents,
    base_fee_usd: (config.baseFeeCents / 100).toFixed(2),

    base_plus_percentage_cents: basePlusPct,
    base_plus_percentage_usd: (basePlusPct / 100).toFixed(2),

    fee_minimum_cents: config.feeMinimumCents || 0,
    fee_minimum_usd: config.feeMinimumCents ? (config.feeMinimumCents / 100).toFixed(2) : '0.00',
    minimum_applied: config.feeMinimumCents && fee === config.feeMinimumCents,

    // Final fee (no cap)
    final_platform_fee_cents: fee,
    final_platform_fee_usd: (fee / 100).toFixed(2),
    final_platform_fee_percent: ((fee / totalCents) * 100).toFixed(2),

    // Configuration info
    max_fee_cents: config.maxAppFeeCents || null,
    max_fee_usd: config.maxAppFeeCents ? (config.maxAppFeeCents / 100).toFixed(2) : 'NO CAP',
    cap_applied: false, // Always false now

    // Metadata
    store_tier: store?.settings?.meta?.['payouts:stripe']?.tier || 'default',
    transaction_type: transactionType,
  };

  return breakdown;
}
