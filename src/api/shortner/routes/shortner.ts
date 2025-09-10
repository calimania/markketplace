/**
 * shortner router
 */

module.exports = {
  routes: [
    // Default CRUD routes
    {
      method: 'GET',
      path: '/shortners',
      handler: 'shortner.find',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/shortners/:documentId',
      handler: 'shortner.findOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Custom routes
    {
      method: 'POST',
      path: '/shortners/create',
      handler: 'shortner.create',
      config: {
        auth: false, // Allow anonymous creation
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/shortners/my',
      handler: 'shortner.findMine',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/shortners/:documentId/unfurl',
      handler: 'shortner.unfurl',
      config: {
        auth: false, // Allow public unfurling
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/shortners/:slug/redirect',
      handler: 'shortner.redirect',
      config: {
        auth: false, // Allow public redirects
        policies: [],
        middlewares: [],
      },
    },
    // For the public redirect route (shorter path)
    {
      method: 'GET',
      path: '/s/:slug',
      handler: 'shortner.redirect',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
