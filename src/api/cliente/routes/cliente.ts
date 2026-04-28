/**
 * Cliente namespace routes
 * Customer-facing authenticated endpoints, separate from tienda and CRM.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/cliente/orders',
      handler: 'cliente.orders',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/cliente/orders/:documentId',
      handler: 'cliente.order',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/cliente/orders/:documentId/subscribe',
      handler: 'cliente.subscribeFromOrder',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/cliente/rsvps/:documentId',
      handler: 'cliente.rsvp',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/cliente/subscription/:documentId',
      handler: 'cliente.subscription',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/cliente/subscription/:documentId',
      handler: 'cliente.unsubscribeSubscription',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
