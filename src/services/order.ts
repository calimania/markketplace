/**
 * Order service: update order from Stripe webhook or payment event
 */

/**
 * Example: Update order status and publish.
 */
export async function completeOrder(orderId: string, strapi: any) {
  const updated = await strapi.documents('api::order.order').update({
    documentId: orderId,
    data: { Status: 'complete' }
  });
  await strapi.documents('api::order.order').publish({ documentId: orderId });
  return updated;
}
