/**
 * Buyer namespace routes
 * Customer-facing authenticated endpoints, separate from tienda and CRM.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/buyer/orders',
      handler: 'buyer.orders',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/buyer/orders/:documentId',
      handler: 'buyer.order',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/buyer/orders/:documentId/subscribe',
      handler: 'buyer.subscribeFromOrder',
      config: { policies: [], middlewares: [] },
    },
  ],
};
