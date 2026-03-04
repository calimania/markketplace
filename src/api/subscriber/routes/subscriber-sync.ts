/**
 * Custom routes for subscriber sync workflow
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/subscribers/subscribe',
      handler: 'subscriber.subscribe',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/subscribers/:documentId/sync-status',
      handler: 'subscriber.syncStatus',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/subscribers/:documentId/sync',
      handler: 'subscriber.sync',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
