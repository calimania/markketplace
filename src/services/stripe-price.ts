import Stripe from 'stripe';
import { getStripeClient } from './stripe';

/**
 * Sync prices with Stripe
 */
export async function syncPricesWithStripe(product: any): Promise<void> {
  const stripeClient = getStripeClient();
  if (!stripeClient || !product.SKU || !Array.isArray(product.PRICES)) {
    return;
  }

  console.log('[STRIPE_PRICE_SERVICE] Syncing prices with Stripe');
  console.log('[STRIPE_PRICE_SERVICE] Product PRICES array:', JSON.stringify(product.PRICES, null, 2));

  for (let i = 0; i < product.PRICES.length; i++) {
    const price = product.PRICES[i];
    console.log(`[STRIPE_PRICE_SERVICE] Processing price ${i + 1}:`, {
      Name: price.Name,
      Price: price.Price,
      STRIPE_ID: price.STRIPE_ID,
      Currency: price.Currency
    });

    // Skip if no price value
    if (!price.Price || price.Price <= 0) {
      console.log(`[STRIPE_PRICE_SERVICE] Skipping price ${i + 1}: invalid or zero price`);
      continue;
    }

    let needsNewPrice = false;
    let oldPriceId = null;

    if (!price.STRIPE_ID) {
      // No Stripe price exists, create new one
      needsNewPrice = true;
      console.log(`[STRIPE_PRICE_SERVICE] Creating new Stripe price: ${price.Name || 'Price ' + (i + 1)}`);
    } else {
      // Check if price value has changed by comparing with existing Stripe price
      console.log(`[STRIPE_PRICE_SERVICE] Checking existing price ${price.STRIPE_ID} for changes...`);
      try {
        const existingPrice = await stripeClient.prices.retrieve(price.STRIPE_ID);
        const currentAmount = Math.round(price.Price * 100);

        console.log(`[STRIPE_PRICE_SERVICE] Price comparison:`, {
          existing: existingPrice.unit_amount,
          current: currentAmount,
          changed: existingPrice.unit_amount !== currentAmount
        });

        if (existingPrice.unit_amount !== currentAmount) {
          needsNewPrice = true;
          oldPriceId = price.STRIPE_ID;
          console.log(`[STRIPE_PRICE_SERVICE] Price value changed (${existingPrice.unit_amount} -> ${currentAmount}), creating new price: ${price.Name || 'Price ' + (i + 1)}`);
        } else {
          console.log(`[STRIPE_PRICE_SERVICE] Price unchanged, skipping: ${price.Name || 'Price ' + (i + 1)}`);
        }
      } catch (error) {
        // If we can't retrieve the existing price, create a new one
        console.warn(`[STRIPE_PRICE_SERVICE] Could not retrieve existing price ${price.STRIPE_ID}, creating new one:`, error.message);
        needsNewPrice = true;
        oldPriceId = price.STRIPE_ID;
      }
    }

    if (needsNewPrice) {
      // Determine product type for tax configuration
      const isDigitalProduct = product.Name.toLowerCase().includes('digital');

      const priceData: Stripe.PriceCreateParams = {
        unit_amount: Math.round(price.Price * 100),
        currency: (price.Currency || 'usd').toLowerCase(),
        product: product.SKU,
        nickname: price.Name || `${product.Name} - Price ${i + 1}`,
        metadata: {
          strapiProductId: product.documentId || product.id || '',
          priceIndex: i.toString(),
          description: price.Description || '',
          lastSyncedAt: new Date().toISOString(),
          replacedPriceId: oldPriceId || '',
          productType: isDigitalProduct ? 'digital' : 'physical',
        },
      };

      // Configure tax behavior based on product type
      if (isDigitalProduct) {
        // Digital products - electronically supplied services
        priceData.tax_behavior = 'exclusive';
        // Stripe will auto-detect as electronically supplied
        console.log(`[STRIPE_PRICE_SERVICE] Configuring price for digital product (electronically supplied)`);
      } else {
        // Physical products - explicitly configure as tangible goods
        priceData.tax_behavior = 'exclusive';
        console.log(`[STRIPE_PRICE_SERVICE] Configuring price for physical product (tangible goods)`);
      }

      try {
        const stripePrice = await stripeClient.prices.create(priceData);
        console.log('[STRIPE_PRICE_SERVICE] Price created successfully:', stripePrice.id);

        // Archive the old price if it exists
        if (oldPriceId) {
          try {
            await stripeClient.prices.update(oldPriceId, { active: false });
            console.log('[STRIPE_PRICE_SERVICE] Archived old price:', oldPriceId);
          } catch (archiveError) {
            console.warn('[STRIPE_PRICE_SERVICE] Could not archive old price:', archiveError.message);
          }
        }

        product.PRICES[i].STRIPE_ID = stripePrice.id;
      } catch (error) {
        console.error('[STRIPE_PRICE_SERVICE] Failed to create price:', error);
      }
    }
  }
}
