/**
 * Cliente namespace routes
 * Customer-facing authenticated endpoints, separate from tienda and CRM.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/cliente/orders',
      handler: 'buyer.orders',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/cliente/orders/:documentId',
      handler: 'buyer.order',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/cliente/orders/:documentId/subscribe',
      handler: 'buyer.subscribeFromOrder',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/cliente/rsvps/:documentId',
      handler: 'buyer.rsvp',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
