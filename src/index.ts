import { registerMiddleware } from './middlewares/encrypt-extensions';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {
    console.log('[APP] Application registered successfully');
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap({ strapi }) {
    console.log('[APP] Application bootstrapped successfully');

    // Register auto-encryption for extension credentials
    // Must be in bootstrap for Document Service middleware
    registerMiddleware({ strapi });
    console.log('[APP] Extension encryption middleware registered');
  },
};
