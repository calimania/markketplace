import { isStripeConfigured } from './stripe';
import { createStripeProduct, updateStripeProductMetadata } from './stripe-product';
import { syncPricesWithStripe } from './stripe-price';

/**
 * Main Stripe synchronization service
 */
export async function syncProductWithStripe(product: any, context: any): Promise<void> {
  console.log(`[STRIPE_SYNC_SERVICE] Starting ${context.action} operation for product: ${product.Name}`);

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
    console.log('[STRIPE_SYNC_SERVICE] Checking if Stripe product needs updating...');
    await updateStripeProductMetadata(product);
  }

  // Step 2: Handle Stripe Prices
  if (Array.isArray(product.PRICES) && product.SKU) {
    await syncPricesWithStripe(product);
  }

  // Step 3: Persist Stripe IDs back to database if new ones were created
  const hasNewSKU = product.SKU && !originalSKU;
  const hasNewPriceIds = product.PRICES?.some((p: any) => p.STRIPE_ID);

  if (hasNewSKU || hasNewPriceIds) {
    console.log('[STRIPE_SYNC_SERVICE] Scheduling persistence of new Stripe IDs...');

    // Use setTimeout to ensure we're outside the current transaction
    setTimeout(async () => {
      try {
        const updateData: any = {};

        if (hasNewSKU) {
          updateData.SKU = product.SKU;
        }

        if (hasNewPriceIds) {
          updateData.PRICES = product.PRICES;
        }

        const updatedProduct = await strapi.documents('api::product.product').update({
          documentId: product.documentId,
          data: updateData,
        });

        // Publish the document to make sure changes are live (not draft)
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
          console.log('[STRIPE_SYNC_SERVICE] Updated product SKU:', updatedProduct.SKU);
        }
      } catch (error) {
        console.error('[STRIPE_SYNC_SERVICE] Failed to persist Stripe IDs:', error.message);
        console.log('[STRIPE_SYNC_SERVICE] MANUAL ACTION REQUIRED:');
        console.log('[STRIPE_SYNC_SERVICE] Product documentId:', product.documentId);

        if (hasNewSKU) {
          console.log('[STRIPE_SYNC_SERVICE] - Set SKU field to:', product.SKU);
        }
        if (hasNewPriceIds) {
          const priceIds = product.PRICES.filter((p: any) => p.STRIPE_ID).map((p: any) => p.STRIPE_ID);
          console.log('[STRIPE_SYNC_SERVICE] - Update PRICES with Stripe IDs:', priceIds);
        }
        console.log('[STRIPE_SYNC_SERVICE] Please update these fields manually in the Strapi admin panel');
      }
    }, 2000);
  }

  console.log('[STRIPE_SYNC_SERVICE] Stripe sync completed successfully');
  if (product.SKU) {
    console.log('[STRIPE_SYNC_SERVICE] Product Stripe ID:', product.SKU);
  }
  if (product.PRICES?.some((p: any) => p.STRIPE_ID)) {
    const syncedPrices = product.PRICES.filter((p: any) => p.STRIPE_ID).map((p: any) => p.STRIPE_ID);
    console.log('[STRIPE_SYNC_SERVICE] Price Stripe IDs:', syncedPrices);
  }
}
