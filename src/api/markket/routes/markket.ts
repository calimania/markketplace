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
    {
      method: 'POST',
      path: '/markket/twilio-sms',
      handler: 'markket.twilioSms',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/markket/refresh-fees/:orderId',
      handler: 'markket.refreshFees',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/markket/debug-fees/:orderId',
      handler: 'markket.debugFees',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
