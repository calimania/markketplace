/**
 * CRM namespace routes
 * Separate from tienda to keep scope focused and role controls extensible.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/crm/orders',
      handler: 'crm.orders',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/crm/subscribers',
      handler: 'crm.subscribers',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/crm/newsletters',
      handler: 'crm.newsletters',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/crm/customers',
      handler: 'crm.customers',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/crm/subscribers/:documentId/sync',
      handler: 'crm.syncSubscriber',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/crm/newsletters/:documentId/send',
      handler: 'crm.sendNewsletter',
      config: { policies: [], middlewares: [] },
    },
    // Pagos — Stripe Connect / payouts
    {
      method: 'GET',
      path: '/pagos/connect',
      handler: 'crm.stripeConnectStatus',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/pagos/connect/onboarding',
      handler: 'crm.createStripeConnectOnboardingLink',
      config: { policies: [], middlewares: [] },
    },
  ],
};

