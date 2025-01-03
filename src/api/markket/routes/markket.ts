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
  ],
};
