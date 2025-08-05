/**
 * store router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::store.store', {
  config: {
    find: {
      middlewares: [],
    },
    findOne: {
      middlewares: [],
    },
  },
  only: ['find', 'findOne', 'create', 'update', 'delete'],
});
