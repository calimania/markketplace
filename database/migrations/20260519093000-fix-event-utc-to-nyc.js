'use strict';

module.exports = {
  async up(knex) {
    if (!(await knex.schema.hasTable('events'))) {
      console.log('[migration:fix-event-utc-to-nyc] events table not found, skipping');
      return;
    }

    if (!(await knex.schema.hasColumn('events', 'timezone'))) {
      console.log('[migration:fix-event-utc-to-nyc] timezone column not found, skipping');
      return;
    }

    const changed = await knex('events')
      .whereNull('timezone')
      .orWhere('timezone', '')
      .orWhere('timezone', 'UTC')
      .update({ timezone: 'America/New_York' });

    console.log(`[migration:fix-event-utc-to-nyc] updated ${changed} event rows`);
  },
};
