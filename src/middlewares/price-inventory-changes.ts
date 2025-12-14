/**
 * Order complete middleware and additional operations
 *
 * When an order turns paid, we run a few base operations and potentially others from the extensions
 * Inventory is only decremented when Status transitions to 'paid'
 * Additionally, this middleware logs all inventory changes for auditing
 *
 * @TODO: review additional operations that affect inventory
 *
 * @param strapi
 */
export function registerMiddleware({ strapi }: { strapi: any }) {
  console.log('[order.middleware]:register');

  strapi.documents.use(async (context: any, next: any) => {
    const result = await next();

    // Quick filter: only schedule work for orders
    if (context.uid === 'api::order.order' && ['update', 'create'].includes(context.action)) {

      // Synchronous debug: middleware observed an order operation and will schedule async work
      console.log('[order.middleware]:scheduled', {
        documentId: result?.documentId,
        action: context.action,
        uid: context.uid,
      });

      const ctx = {
        contextData: context.data,
        contextPrevious: context.previous,
        contextAction: context.action,
        documentId: result?.documentId,
      };

      try {
        console.log('[order.middleware]:scheduling_async', { orderId: ctx.documentId });

        setImmediate(async () => {
          console.log('[order.middleware][async]:scheduled:start', { orderId: ctx.documentId });
          try {
            // Recreate local vars for clarity
            const dataKeys = Object.keys(ctx.contextData || {});
            // allow reassignment after we fetch canonical order
            let prevStatus = ctx.contextPrevious?.Status;
            let newStatus = result.Status || ctx.contextData?.Status;

            console.log('[order.middleware][async]:processing', {
              documentId: ctx.documentId,
              prevStatus,
              newStatus,
              action: ctx.contextAction,
              dataKeysLength: dataKeys.length
            });

            // Ensure Details present (try to populate if missing)
            let orderWithDetails = null;
            let details: any[] = Array.isArray(result.Details) ? result.Details : [];
            try {
              orderWithDetails = await strapi.documents('api::order.order').findOne({
                documentId: ctx.documentId,
                populate: ['Details', 'Details.product']
              });
              if (orderWithDetails) {
                details = Array.isArray(orderWithDetails.Details) ? orderWithDetails.Details : details;
                // prefer the canonical previous status from the fetched order when available
                prevStatus = orderWithDetails?.Status ?? prevStatus;
                // recompute newStatus from the canonical order when available
                newStatus = orderWithDetails?.Status ?? newStatus;
              }
              console.log('[order.middleware][async]:details', { orderId: ctx.documentId, count: details.length });
              // Log canonical statuses for debugging transition detection
              console.log('[order.middleware][async]:info:[status.canonical]', { orderId: ctx.documentId, prevStatus, newStatus });
            } catch (err) {
              console.error('[order.middleware][async]:error:[details]', { orderId: ctx.documentId, error: err?.message });
            }

            // Act when order is currently paid and it has not been processed (idempotent)
            // This avoids relying on context.previous which can be undefined.
            const currentExtra = (orderWithDetails && orderWithDetails.extra) || (result && result.extra) || {};
            if (newStatus === 'paid' && !currentExtra?.inventory_decremented) {
              console.log('[order.middleware][async]:info:[trigger]', {
                orderId: ctx.documentId,
                reason: 'paid_and_not_processed',
                prevStatus,
                newStatus
              });
            // continue processing...

              const productSoldMap: Record<string, number> = {};
              const pricesToUpdate: Record<string, any[]> = {};

              for (const item of details) {
                let productId: string | undefined;
                if (item.product && typeof item.product === 'object' && item.product.documentId) {
                  productId = item.product.documentId;
                }

                if (!productId || !item.product) {
                  console.warn('[order.middleware][async]:warn:[detail.missing_product]', { item });
                  continue;
                }

                // collect items per product, do not increment productSoldMap yet
                if (!pricesToUpdate[productId]) pricesToUpdate[productId] = [];
                pricesToUpdate[productId].push(item);
              }

              // Batch update PRICES per product
              for (const [productId, items] of Object.entries(pricesToUpdate)) {
                try {
                  const product = await strapi.documents('api::product.product').findOne({
                    documentId: productId,
                    populate: ['PRICES']
                  });

                  if (!product || !Array.isArray(product.PRICES)) {
                    console.warn('[order.middleware][async]:warn:[product.missing_prices]', { productId });
                    continue;
                  }

                  const updatedPrices = [...product.PRICES];
                  let changed = false;

                  for (const item of items) {
                    const qty = item.Quantity || 1;

                    // match by STRIPE_ID on the PRICES component
                    const matchedPriceIndex = updatedPrices.findIndex((p: any) => p.STRIPE_ID === item.Stripe_price_id);

                    if (matchedPriceIndex === -1) {
                      console.warn('[order.middleware][async]:warn:[price.not_found]', { productId, itemStripePriceId: item.Stripe_price_id, itemName: item.Name });
                      continue;
                    }

                    const matchedPrice = updatedPrices[matchedPriceIndex];
                    if (typeof matchedPrice.inventory === 'number') {
                      const newInventory = matchedPrice.inventory - qty;
                      updatedPrices[matchedPriceIndex] = { ...matchedPrice, inventory: newInventory };
                      changed = true;

                      // Only increment amount to be recorded later when the matched price was processed
                      productSoldMap[productId] = (productSoldMap[productId] || 0) + qty;

                      if (newInventory <= 1) {
                        console.warn('[order.middleware][async]:warn:[inventory.low]', { productId, matchedPriceIndex, newInventory });
                      }
                    } else {
                      // If inventory is not tracked, do NOT increment amountSold here
                      // (only count soldQty for items with matching price AND numeric inventory)
                    }
                  }

                  if (changed) {
                    try {
                      const updateResp = await strapi.documents('api::product.product').update({
                        documentId: productId,
                        data: { PRICES: updatedPrices }
                      });
                      console.log('[order.middleware][async]:info:[prices.update_response]', {
                        productId,
                        updatedDocumentId: updateResp?.documentId || updateResp?.id
                      });

                      try {
                        await strapi.documents('api::product.product').publish({ documentId: productId });
                        console.log('[order.middleware][async]:info:[prices.published]', { productId });
                      } catch (pubErr) {
                        console.warn('[order.middleware][async]:warn:[prices.publish_failed]', { productId, error: pubErr?.message });
                      }

                      // VERIFY and mark processedAny if persisted
                      try {
                        const verify = await strapi.documents('api::product.product').findOne({
                          documentId: productId,
                          populate: ['PRICES']
                        });
                        console.log('[order.middleware][async]:info:[prices.verify]', {
                          productId,
                          persistedPricesCount: Array.isArray(verify?.PRICES) ? verify.PRICES.length : 0,
                          persistedSample: Array.isArray(verify?.PRICES) ? verify.PRICES.slice(0, 3).map((p: any) => ({ STRIPE_ID: p.STRIPE_ID, inventory: p.inventory })) : []
                        });
                        // mark that we persisted something (used later to decide idempotency mark)
                        (ctx as any)._processedAny = true;
                      } catch (vErr) {
                        console.warn('[order.middleware][async]:warn:[prices.verify_failed]', { productId, error: vErr?.message });
                      }
                    } catch (updateErr) {
                      console.error('[order.middleware][async]:error:[prices.update_failed]', { productId, error: updateErr?.message });
                    }
                  }
                } catch (err) {
                  console.error('[order.middleware][async]:error:[prices.processing]', { productId: (productId as string), error: err?.message });
                }
              }

              // Update amountSold for each product only based on matched+processed price items
              for (const [productId, soldQty] of Object.entries(productSoldMap)) {
                try {
                  // read -> compute -> write
                  const prod = await strapi.documents('api::product.product').findOne({ documentId: productId });
                  const prev = prod && typeof prod.amountSold === 'number' ? prod.amountSold : 0;
                  const next = prev + soldQty;

                  const updateAmountResp = await strapi.documents('api::product.product').update({
                    documentId: productId,
                    data: { amountSold: next }
                  });
                  console.log('[order.middleware][async]:info:[amountSold.update_response]', {
                    productId,
                    updatedDocumentId: updateAmountResp?.documentId || updateAmountResp?.id
                  });

                  try {
                    await strapi.documents('api::product.product').publish({ documentId: productId });
                    console.log('[order.middleware][async]:info:[amountSold.published]', { productId });
                  } catch (pubErr) {
                    console.warn('[order.middleware][async]:warn:[amountSold.publish_failed]', { productId, error: pubErr?.message });
                  }

                  // VERIFY persisted value
                  try {
                    const verifyProd = await strapi.documents('api::product.product').findOne({ documentId: productId });
                    console.log('[order.middleware][async]:info:[amountSold.verify]', {
                      productId,
                      persistedAmountSold: verifyProd?.amountSold
                    });
                    (ctx as any)._processedAny = true;
                  } catch (vErr) {
                    console.warn('[order.middleware][async]:warn:[amountSold.verify_failed]', { productId, error: vErr?.message });
                  }
                } catch (err) {
                  console.error('[order.middleware][async]:error:[amountSold.processing]', { productId: (productId as string), error: err?.message });
                }
              }

              // Mark order as processed to avoid duplicate decrements (only if we actually changed/persisted something)
              try {
                const processedAny = !!(ctx as any)._processedAny;
                if (processedAny) {
                  await strapi.documents('api::order.order').update({
                    documentId: ctx.documentId,
                    data: {
                      extra: {
                        ...(currentExtra || {}),
                        inventory_decremented: true,
                        inventory_decremented_at: new Date().toISOString()
                      }
                    }
                  });
                  console.log('[order.middleware][async]:info:[idempotency.marked]', { orderId: ctx.documentId });
                } else {
                  console.log('[order.middleware][async]:info:[idempotency.not_marked_no_changes]', { orderId: ctx.documentId });
                }
              } catch (markErr) {
                console.warn('[order.middleware][async]:warn:[idempotency.mark_failed]', { orderId: ctx.documentId, error: markErr?.message });
              }
            } // end transition check

          } catch (err) {
            console.error('[order.middleware][async]:error:', { error: err?.message });
          } finally {
            // mark end of async scheduled work
            console.log('[order.middleware][async]:scheduled:end', { orderId: ctx.documentId });
          }
        });
      } catch (schedErr) {
        console.error('[order.middleware]:error:[scheduling]', { orderId: ctx.documentId, error: schedErr?.message });
      }
    }

    return result;
  });
}
