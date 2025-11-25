/**
 * Store Dashboard Routes
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/stores/:id/dashboard',
      handler: 'store.getDashboard',
      config: {
        policies: [], // Auth checked in controller
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/stores/:id/content-counts',
      handler: 'store.getContentCounts',
      config: {
        auth: false, // Public - for homepage rendering
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/stores/:id/sales-summary',
      handler: 'store.getSalesSummary',
      config: {
        policies: [], // Auth checked in controller
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/stores/:id/recent-orders',
      handler: 'store.getRecentOrders',
      config: {
        policies: [], // Auth checked in controller
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/stores/:id/stripe-status',
      handler: 'store.getStripeStatus',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/stores/:id/activity',
      handler: 'store.getRecentActivity',
      config: {},
    },
    {
      method: 'GET',
      path: '/stores/:id/quick-stats',
      handler: 'store.getQuickStats',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/stores/:id/visibility',
      handler: 'store.getVisibilityFlags',
      config: { auth: false },
    },
  ],
};
