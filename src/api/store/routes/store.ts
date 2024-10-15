/**
 * store router
 */

import { factories } from '@strapi/strapi';

const routes = factories.createCoreRouter("api::store.store", {
  config: {
    find: {
      middlewares: ["api::store.populate-store"],
    },
    findOne: {
      middlewares: ["api::store.populate-store"],
    },
  },
});

export default routes;
