/**
 * Custom customer routes - Search functionality
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/customers/search',
      handler: 'customer.search',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/customers/find-by-email',
      handler: 'customer.findByEmail',
      config: {
        policies: [],
      },
    },
  ],
};
