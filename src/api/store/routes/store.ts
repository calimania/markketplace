/**
 * store router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::store.store', {
  config: {
    find: {
      auth: false,
      middlewares: [],
    },
    findOne: {
      auth: false,
      middlewares: [],
    },
  },
  only: ['find', 'findOne'],
});
