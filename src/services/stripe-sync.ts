import { isStripeConfigured } from './stripe';
import { createStripeProduct, updateStripeProductMetadata } from './stripe-product';
import { syncPricesWithStripe } from './stripe-price';
import { validateProductData, sanitizeForLogging } from './stripe-security';

// Debouncing map to prevent rapid updates
const updateDebounce = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 200; // 0.2 seconds - fast and responsive

type SyncContext = {
  action?: 'create' | 'update' | string;
  contentTypeUid?: 'api::product.product' | 'api::event.event';
  stripeProductField?: string;
};

/**
 * Main Stripe synchronization service
 */
export async function syncProductWithStripe(product: any, context: any): Promise<void> {
  const syncContext: SyncContext = context || {};
  const contentTypeUid: 'api::product.product' | 'api::event.event' =
    syncContext.contentTypeUid || 'api::product.product';
  const stripeProductField = syncContext.stripeProductField || 'SKU';

  // Work with a normalized shape so downstream services can continue using `SKU`.
  const workingProduct = {
    ...product,
    SKU: product?.[stripeProductField],
  };

  // Validate input data
  const validation = validateProductData(workingProduct);
  if (!validation.valid) {
    console.error('[STRIPE_SYNC_SERVICE] Invalid product data:', validation.errors);
    return;
  }

  // Sanitize product name for logging
  const sanitizedName = sanitizeForLogging(workingProduct.Name, 'Name');
  console.log(`[STRIPE_SYNC_SERVICE] Starting ${syncContext.action || 'sync'} operation for product: ${sanitizedName}`);

  if (!isStripeConfigured()) {
    console.warn('[STRIPE_SYNC_SERVICE] No Stripe clients configured, skipping product sync');
    return;
  }

  // Store original values to detect what's new
  const originalSKU = workingProduct.SKU;

  // Step 1: Handle Stripe Product creation
  if (!workingProduct.SKU && workingProduct.Name) {
    const stripeProductId = await createStripeProduct(workingProduct);
    if (stripeProductId) {
      workingProduct.SKU = stripeProductId;
      product[stripeProductField] = stripeProductId;
    } else {
      console.error('[STRIPE_SYNC_SERVICE] Failed to create Stripe product, skipping price sync');
      return;
    }
  }

  // Step 1.5: Update existing Stripe Product if metadata changed
  if (workingProduct.SKU && syncContext.action === 'update') {
    // Only update if we're sure this isn't a partial read
    if (workingProduct.Name) { // Name is required, so if it's missing this might be partial data
      console.log('[STRIPE_SYNC_SERVICE] Checking if Stripe product needs updating...');
      await updateStripeProductMetadata(workingProduct);
    } else {
      console.log('[STRIPE_SYNC_SERVICE] Skipping product metadata update - incomplete product data');
    }
  }

  // Step 2: Handle Stripe Prices (robust, tolerant of missing fields)
  if (Array.isArray(workingProduct.prices) && workingProduct.sku) {
    // Accept prices with just Name, Price, Currency for creation
    const validPrices = workingProduct.prices.filter(p => p && (p.name && p.price !== undefined && p.currency));
    if (validPrices.length > 0) {
      await syncPricesWithStripe({
        ...workingProduct,
        prices: validPrices
      });
      // After sync, ensure STRIPE_ID is updated for all prices
      workingProduct.prices = workingProduct.prices.map((p: any, idx: number) => ({
        ...p,
        stripe_id: validPrices[idx]?.stripe_id || p.stripe_id || ''
      }));
      product.prices = workingProduct.prices;

    } else {
      console.warn('[STRIPE_SYNC_SERVICE] No valid prices found for sync. Each price should have Name, Price, and Currency.');
    }
  }

  // Step 3: Persist Stripe IDs back to database if new ones were created
  const hasNewSKU = workingProduct.sku && !originalSKU;
  const hasNewPriceIds = workingProduct.prices?.some((p: any) => p.stripe_id);

  if (hasNewSKU || hasNewPriceIds) {
    console.log('[STRIPE_SYNC_SERVICE] Scheduling persistence of new Stripe IDs...');

    // Clear any existing debounce for this product
    const debounceKey = product.documentId;
    if (updateDebounce.has(debounceKey)) {
      clearTimeout(updateDebounce.get(debounceKey)!);
    }

    // Use setTimeout to ensure we're outside the current transaction
    // and add debouncing to prevent rapid successive updates
    const timeoutId = setTimeout(async () => {
      try {
        // Remove from debounce map
        updateDebounce.delete(debounceKey);

        const updateData: any = {};

        if (hasNewSKU) {
          updateData[stripeProductField] = workingProduct.sku;
        }

        if (hasNewPriceIds) {
          updateData.prices = workingProduct.prices;
        }

        console.log('[STRIPE_SYNC_SERVICE] Persisting Stripe IDs to database...');

        const updatedProduct = await strapi.documents(contentTypeUid).update({
          documentId: workingProduct.documentId,
          data: updateData,
        });

        if (updatedProduct) {
          console.log('[STRIPE_SYNC_SERVICE] Successfully persisted Stripe IDs to database');
          console.log('[STRIPE_SYNC_SERVICE] Updated product with new Stripe references');
        }
      } catch (error) {
        console.error('[STRIPE_SYNC_SERVICE] Failed to persist Stripe IDs:', error.message);
        console.log('[STRIPE_SYNC_SERVICE] MANUAL ACTION REQUIRED:');
        console.log('[STRIPE_SYNC_SERVICE] Product documentId: [REDACTED]');

        if (hasNewSKU) {
          console.log(`[STRIPE_SYNC_SERVICE] - Set ${stripeProductField} field to: [NEW_STRIPE_PRODUCT_ID]`);
        }
        if (hasNewPriceIds) {
          const priceCount = workingProduct.prices.filter((p: any) => p.stripe_id).length;
          console.log('[STRIPE_SYNC_SERVICE] - Update prices with new stripe_id (', priceCount, 'prices)');
        }
        console.log('[STRIPE_SYNC_SERVICE] Please update these fields manually in the Strapi admin panel');
      }
    }, DEBOUNCE_DELAY);

    // Store the timeout ID for potential cancellation
    updateDebounce.set(debounceKey, timeoutId);
  }

  console.log('[STRIPE_SYNC_SERVICE] Stripe sync completed successfully');
  if (workingProduct.SKU) {
    console.log('[STRIPE_SYNC_SERVICE] Product has Stripe product ID');
  }

  if (workingProduct.prices?.some((p: any) => p.stripe_id)) {
    const syncedCount = workingProduct.prices.filter((p: any) => p.stripe_id).length;
    console.log('[STRIPE_SYNC_SERVICE] Synced prices count:', syncedCount);
  }
}
