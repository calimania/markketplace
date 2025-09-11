import { syncProductWithStripe } from '../services/stripe-sync';

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

    console.log(`[STRIPE_PRODUCT_SYNC] Triggering Stripe sync for ${context.action} on product`);
    console.log(`[STRIPE_PRODUCT_SYNC] Product data:`, {
      documentId: result.documentId,
      Name: result.Name,
      SKU: result.SKU,
      PRICES: result.PRICES ? result.PRICES.length : 0
    });

    // Sync with Stripe asynchronously after the document operation completes
    setImmediate(async () => {
      try {
        await syncProductWithStripe(result, context);
      } catch (error) {
        console.error('[STRIPE_PRODUCT_SYNC] Error syncing product with Stripe:', error);
      }
    });

    return result;
  });
}
