import { registerMiddleware } from './middlewares/encrypt-extensions';
import { registerMiddleware as registerPriceInventoryChanges } from './middlewares/price-inventory-changes';

export default {
  register(/*{ strapi }*/) {
    console.log('[markket]:register');
  },

  bootstrap({ strapi }) {
    console.log('[markket]:bootstrap');
    registerMiddleware({ strapi });
    registerPriceInventoryChanges({ strapi });
  },
};
