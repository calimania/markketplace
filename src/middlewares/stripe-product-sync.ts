import { syncProductWithStripe } from '../services/stripe-sync';

// Track active sync operations to prevent race conditions
const activeSyncs = new Set<string>();

/**
 * Document Service middleware for Stripe product synchronization
 * Registers globally but only applies to product operations
 */
export function registerStripeProductSync({ strapi }: { strapi: any }) {
  console.log('[STRIPE_PRODUCT_SYNC] Registering Document Service middleware...');

  strapi.documents.use(async (context: any, next: any) => {
    console.log(`[STRIPE_PRODUCT_SYNC] Intercepted: ${context.action} on ${context.uid}`);

    // Execute the original operation first
    const result = await next();

    // Only apply to product content type
    if (context.uid !== 'api::product.product') {
      console.log(`[STRIPE_PRODUCT_SYNC] Skipping non-product: ${context.uid}`);
      return result;
    }

    // Only apply to create and update operations
    if (!['create', 'update'].includes(context.action)) {
      console.log(`[STRIPE_PRODUCT_SYNC] Skipping action: ${context.action}`);
      return result;
    }

    // Check if this is a Stripe-initiated update (to prevent loops)
    if (context.data && (context.data.SKU || context.data.PRICES)) {
      // Check if this update only contains Stripe-related fields
      const dataKeys = Object.keys(context.data);
      const stripeOnlyUpdate = dataKeys.every(key =>
        ['SKU', 'PRICES', 'updatedAt', 'publishedAt'].includes(key)
      );

      if (stripeOnlyUpdate) {
        console.log(`[STRIPE_PRODUCT_SYNC] Skipping Stripe-initiated update to prevent loops`);
        return result;
      }
    }

    // Prevent concurrent syncs for the same product
    const syncKey = result.documentId;
    if (activeSyncs.has(syncKey)) {
      console.log(`[STRIPE_PRODUCT_SYNC] Sync already in progress for product, skipping`);
      return result;
    }

    console.log(`[STRIPE_PRODUCT_SYNC] Triggering Stripe sync for ${context.action} on product`);
    console.log(`[STRIPE_PRODUCT_SYNC] Product summary:`, {
      documentId: result.documentId ? '[REDACTED]' : null,
      hasName: !!result.Name,
      hasSKU: !!result.SKU,
      pricesCount: result.PRICES ? result.PRICES.length : 0
    });

    // Track this sync operation
    activeSyncs.add(syncKey);

    // Sync with Stripe asynchronously after the document operation completes
    setImmediate(async () => {
      try {
        await syncProductWithStripe(result, context);
      } catch (error) {
        console.error('[STRIPE_PRODUCT_SYNC] Error syncing product with Stripe:', error);
      } finally {
        // Always remove from active syncs when done
        activeSyncs.delete(syncKey);
      }
    });

    return result;
  });
}
