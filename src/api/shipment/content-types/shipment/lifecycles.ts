import { Event } from '@strapi/database/dist/lifecycles';

import { v4 as uuid } from 'uuid';

export default {
  beforeCreate(event: Event) {
    const { data } = event.params;

    data.uuid = uuid();
  },
};

