/**
 * Store compatibility action routes
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/stores/:id/actions/publish',
      handler: 'store.publishAction',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/stores/:id/actions/unpublish',
      handler: 'store.unpublishAction',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
