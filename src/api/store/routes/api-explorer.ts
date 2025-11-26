/**
 * API Explorer route for testing endpoints
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/api-explorer',
      handler: 'store.apiExplorer',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/api-explorer.js',
      handler: 'store.apiExplorerJS',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
