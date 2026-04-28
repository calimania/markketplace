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
      method: 'POST',
      path: '/subscribers/unsubscribe',
      handler: 'subscriber.unsubscribe',
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
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/subscribers/:documentId/sync',
      handler: 'subscriber.sync',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
