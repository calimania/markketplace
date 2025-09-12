export default {
  routes: [
    {
      method: 'POST',
      path: '/products/:documentId/stripe_sync',
      handler: 'product.stripeSync',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    }
  ]
}
