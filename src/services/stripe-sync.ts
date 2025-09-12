import { isStripeConfigured } from './stripe';
import { createStripeProduct, updateStripeProductMetadata } from './stripe-product';
import { syncPricesWithStripe } from './stripe-price';
import { validateProductData, sanitizeForLogging } from './stripe-security';

// Debouncing map to prevent rapid updates
const updateDebounce = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 500; // 0.5 seconds - fast and responsive

/**
 * Main Stripe synchronization service
 */
export async function syncProductWithStripe(product: any, context: any): Promise<void> {
  // Validate input data
  const validation = validateProductData(product);
  if (!validation.valid) {
    console.error('[STRIPE_SYNC_SERVICE] Invalid product data:', validation.errors);
    return;
  }

  // Sanitize product name for logging
  const sanitizedName = sanitizeForLogging(product.Name, 'Name');
  console.log(`[STRIPE_SYNC_SERVICE] Starting ${context.action} operation for product: ${sanitizedName}`);

  if (!isStripeConfigured()) {
    console.warn('[STRIPE_SYNC_SERVICE] No Stripe clients configured, skipping product sync');
    return;
  }

  // Store original values to detect what's new
  const originalSKU = product.SKU;

  // Step 1: Handle Stripe Product creation
  if (!product.SKU && product.Name) {
    const stripeProductId = await createStripeProduct(product);
    if (stripeProductId) {
      product.SKU = stripeProductId;
    } else {
      console.error('[STRIPE_SYNC_SERVICE] Failed to create Stripe product, skipping price sync');
      return;
    }
  }

  // Step 1.5: Update existing Stripe Product if metadata changed
  if (product.SKU && context.action === 'update') {
    // Only update if we're sure this isn't a partial read
    if (product.Name) { // Name is required, so if it's missing this might be partial data
      console.log('[STRIPE_SYNC_SERVICE] Checking if Stripe product needs updating...');
      await updateStripeProductMetadata(product);
    } else {
      console.log('[STRIPE_SYNC_SERVICE] Skipping product metadata update - incomplete product data');
    }
  }

  // Step 2: Handle Stripe Prices (robust, tolerant of missing fields)
  if (Array.isArray(product.PRICES) && product.SKU) {
    // Accept prices with just Name, Price, Currency for creation
    const validPrices = product.PRICES.filter(p => p && (p.Name && p.Price !== undefined && p.Currency));
    if (validPrices.length > 0) {
      await syncPricesWithStripe({
        ...product,
        PRICES: validPrices
      });
      // After sync, ensure STRIPE_ID is updated for all prices
      product.PRICES = product.PRICES.map((p: any, idx: number) => ({
        ...p,
        STRIPE_ID: validPrices[idx]?.STRIPE_ID || p.STRIPE_ID || ''
      }));
    } else {
      console.warn('[STRIPE_SYNC_SERVICE] No valid prices found for sync. Each price should have Name, Price, and Currency.');
    }
  }

  // Step 3: Persist Stripe IDs back to database if new ones were created
  const hasNewSKU = product.SKU && !originalSKU;
  const hasNewPriceIds = product.PRICES?.some((p: any) => p.STRIPE_ID);

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
          updateData.SKU = product.SKU;
        }

        if (hasNewPriceIds) {
          updateData.PRICES = product.PRICES;
        }

        console.log('[STRIPE_SYNC_SERVICE] Persisting Stripe IDs to database...');

        const updatedProduct = await strapi.documents('api::product.product').update({
          documentId: product.documentId,
          data: updateData,
        });        // Publish the document to make sure changes are live (not draft)
        if (updatedProduct) {
          try {
            await strapi.documents('api::product.product').publish({
              documentId: product.documentId,
            });
            console.log('[STRIPE_SYNC_SERVICE] Successfully published product with Stripe IDs');
          } catch (publishError) {
            console.warn('[STRIPE_SYNC_SERVICE] Product updated but failed to publish:', publishError.message);
            console.log('[STRIPE_SYNC_SERVICE] You may need to manually publish the product in admin panel');
          }
        }

        if (updatedProduct) {
          console.log('[STRIPE_SYNC_SERVICE] Successfully persisted Stripe IDs to database');
          console.log('[STRIPE_SYNC_SERVICE] Updated product with new Stripe references');
        }
      } catch (error) {
        console.error('[STRIPE_SYNC_SERVICE] Failed to persist Stripe IDs:', error.message);
        console.log('[STRIPE_SYNC_SERVICE] MANUAL ACTION REQUIRED:');
        console.log('[STRIPE_SYNC_SERVICE] Product documentId: [REDACTED]');

        if (hasNewSKU) {
          console.log('[STRIPE_SYNC_SERVICE] - Set SKU field to: [NEW_STRIPE_PRODUCT_ID]');
        }
        if (hasNewPriceIds) {
          const priceCount = product.PRICES.filter((p: any) => p.STRIPE_ID).length;
          console.log('[STRIPE_SYNC_SERVICE] - Update PRICES with new Stripe IDs (', priceCount, 'prices)');
        }
        console.log('[STRIPE_SYNC_SERVICE] Please update these fields manually in the Strapi admin panel');
      }
    }, DEBOUNCE_DELAY);

    // Store the timeout ID for potential cancellation
    updateDebounce.set(debounceKey, timeoutId);
  }

  console.log('[STRIPE_SYNC_SERVICE] Stripe sync completed successfully');
  if (product.SKU) {
    console.log('[STRIPE_SYNC_SERVICE] Product has Stripe product ID');
  }
  if (product.PRICES?.some((p: any) => p.STRIPE_ID)) {
    const syncedCount = product.PRICES.filter((p: any) => p.STRIPE_ID).length;
    console.log('[STRIPE_SYNC_SERVICE] Synced prices count:', syncedCount);
  }
}
