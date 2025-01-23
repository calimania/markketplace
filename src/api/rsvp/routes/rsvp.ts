/**
 * rsvp router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::rsvp.rsvp', {
  config: {
    create: {
      middlewares: [
        {
          name: 'api::rsvp.notification',
          config: {}
        }
      ]
    }
  }
});
