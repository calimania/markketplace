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

  const createdPrices = [];
  const skippedPrices = [];
  for (let i = 0; i < product.PRICES.length; i++) {
    const price = product.PRICES[i];
    const missingFields = [];
    if (!price.Name || typeof price.Name !== 'string' || price.Name.trim() === '') missingFields.push('Name');
    if (price.Price === undefined || price.Price === null || isNaN(price.Price) || Number(price.Price) <= 0) missingFields.push('Price');
    if (!price.Currency || typeof price.Currency !== 'string' || price.Currency.trim() === '') missingFields.push('Currency');

    if (missingFields.length > 0) {
      console.warn(`[STRIPE_PRICE_SERVICE] Skipping price ${i + 1}: missing or invalid fields [${missingFields.join(', ')}]`, price);
      skippedPrices.push({ index: i, reason: `Missing fields: ${missingFields.join(', ')}`, price });
      continue;
    }

    console.log(`[STRIPE_PRICE_SERVICE] Processing price ${i + 1}:`, {
      Name: price.Name,
      Price: price.Price,
      STRIPE_ID: price.STRIPE_ID,
      Currency: price.Currency
    });

    // Safety check: don't process if this looks like incomplete data
    if (price.STRIPE_ID && !price.Name && price.Price === 0) {
      console.log(`[STRIPE_PRICE_SERVICE] Skipping price ${i + 1}: appears to be incomplete data`);
      skippedPrices.push({ index: i, reason: 'Incomplete data', price });
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
        const currentAmount = Math.round(Number(price.Price) * 100);

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
          skippedPrices.push({ index: i, reason: 'Price unchanged', price });
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
        unit_amount: Math.round(Number(price.Price) * 100),
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
        createdPrices.push({ index: i, stripeId: stripePrice.id, price });

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
        skippedPrices.push({ index: i, reason: 'Stripe error', error, price });
      }
    }
  }

  // Summary log
  console.log('[STRIPE_PRICE_SERVICE] Price sync summary:');
  if (createdPrices.length > 0) {
    console.log('  Created prices:', createdPrices.map(p => ({ index: p.index, stripeId: p.stripeId, name: p.price.Name, price: p.price.Price })));
  }
  if (skippedPrices.length > 0) {
    console.log('  Skipped prices:', skippedPrices.map(p => ({ index: p.index, reason: p.reason, name: p.price.Name, price: p.price.Price })));
  }
}
