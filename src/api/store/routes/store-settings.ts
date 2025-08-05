/**
 * Custom routes for store settings
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/stores/:id/settings',
      handler: 'store.getSettings',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/stores/:id/settings',
      handler: 'store.updateSettings',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
