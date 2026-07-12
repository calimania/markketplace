import { isStripeConfigured } from './stripe';
import { createStripeProduct, updateStripeProductMetadata } from './stripe-product';
import { syncPricesWithStripe } from './stripe-price';
import { validateProductData, sanitizeForLogging } from './stripe-security';

// Debouncing map to prevent rapid updates
const updateDebounce = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 500; // 0.5 seconds - fast and responsive

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
  if (Array.isArray(workingProduct.PRICES) && workingProduct.SKU) {
    // Accept prices with just Name, Price, Currency for creation
    const validPrices = workingProduct.PRICES.filter(p => p && (p.Name && p.Price !== undefined && p.Currency));
    if (validPrices.length > 0) {
      await syncPricesWithStripe({
        ...workingProduct,
        PRICES: validPrices
      });
      // After sync, ensure STRIPE_ID is updated for all prices
      workingProduct.PRICES = workingProduct.PRICES.map((p: any, idx: number) => ({
        ...p,
        STRIPE_ID: validPrices[idx]?.STRIPE_ID || p.STRIPE_ID || ''
      }));
      product.PRICES = workingProduct.PRICES;
    } else {
      console.warn('[STRIPE_SYNC_SERVICE] No valid prices found for sync. Each price should have Name, Price, and Currency.');
    }
  }

  // Step 3: Persist Stripe IDs back to database if new ones were created
  const hasNewSKU = workingProduct.SKU && !originalSKU;
  const hasNewPriceIds = workingProduct.PRICES?.some((p: any) => p.STRIPE_ID);

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
          updateData[stripeProductField] = workingProduct.SKU;
        }

        if (hasNewPriceIds) {
          updateData.PRICES = workingProduct.PRICES;
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
          const priceCount = workingProduct.PRICES.filter((p: any) => p.STRIPE_ID).length;
          console.log('[STRIPE_SYNC_SERVICE] - Update PRICES with new Stripe IDs (', priceCount, 'prices)');
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
  if (workingProduct.PRICES?.some((p: any) => p.STRIPE_ID)) {
    const syncedCount = workingProduct.PRICES.filter((p: any) => p.STRIPE_ID).length;
    console.log('[STRIPE_SYNC_SERVICE] Synced prices count:', syncedCount);
  }
}
