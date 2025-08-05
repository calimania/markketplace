/**
 * Markket router
 */

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/markket',
      handler: 'markket.about',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/markket',
      handler: 'markket.create',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/markket/email',
      handler: 'markket.email',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
