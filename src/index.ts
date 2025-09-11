import { registerStripeProductSync } from './middlewares/stripe-product-sync';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    // Register Stripe product synchronization middleware
    registerStripeProductSync({ strapi });
    
    console.log('[APP] Application registered successfully');
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap(/*{ strapi }*/) {
    console.log('[APP] Application bootstrapped successfully');
  },
};
