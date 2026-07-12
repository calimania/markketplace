export default {
  routes: [
    {
      method: 'POST',
      path: '/events/:documentId/stripe_sync',
      handler: 'event.stripeSync',
      config: {
        policies: [],
        middlewares: [],
      },
    }
  ]
}
