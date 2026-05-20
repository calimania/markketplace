'use strict';

const NYC_TIMEZONE = 'America/New_York';

function getTimeZoneOffsetMs(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
    0
  );

  return asUtc - date.getTime();
}

function convertStoredUtcToNycUtc(rawValue) {
  if (!rawValue) {
    return null;
  }

  const source = new Date(rawValue);
  if (Number.isNaN(source.getTime())) {
    return null;
  }

  // Existing values were saved as UTC even though they represented NYC wall-clock time.
  // Reinterpret UTC components as NYC local time, then convert back to real UTC.
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const hour = source.getUTCHours();
  const minute = source.getUTCMinutes();
  const second = source.getUTCSeconds();
  const millisecond = source.getUTCMilliseconds();

  const localWallClockAsUtc = Date.UTC(year, month, day, hour, minute, second, millisecond);

  let corrected = localWallClockAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(corrected), NYC_TIMEZONE);
    const next = localWallClockAsUtc - offsetMs;
    if (next === corrected) {
      break;
    }
    corrected = next;
  }

  return new Date(corrected).toISOString();
}

module.exports = {
  async up(knex) {
    const hasEventsTable = await knex.schema.hasTable('events');
    if (!hasEventsTable) {
      console.log('[migration:fix-event-utc-to-nyc] events table not found, skipping');
      return;
    }

    const hasStartDate = await knex.schema.hasColumn('events', 'start_date');
    const hasEndDate = await knex.schema.hasColumn('events', 'end_date');
    const hasTimezone = await knex.schema.hasColumn('events', 'timezone');

    if (!hasStartDate && !hasEndDate) {
      console.log('[migration:fix-event-utc-to-nyc] no datetime columns found, skipping');
      return;
    }

    const rows = await knex('events')
      .select(['id', ...(hasStartDate ? ['start_date'] : []), ...(hasEndDate ? ['end_date'] : []), ...(hasTimezone ? ['timezone'] : [])])
      .where((qb) => {
        if (!hasTimezone) {
          qb.whereRaw('1 = 1');
          return;
        }

        qb.whereNull('timezone').orWhere('timezone', '').orWhere('timezone', 'UTC');
      })
      .andWhere((qb) => {
        if (hasStartDate) {
          qb.whereNotNull('start_date');
        }
        if (hasEndDate) {
          if (hasStartDate) {
            qb.orWhereNotNull('end_date');
          } else {
            qb.whereNotNull('end_date');
          }
        }
      });

    if (!rows.length) {
      console.log('[migration:fix-event-utc-to-nyc] no matching events found');
      return;
    }

    let changed = 0;
    for (const row of rows) {
      const nextStart = hasStartDate ? convertStoredUtcToNycUtc(row.start_date) : null;
      const nextEnd = hasEndDate ? convertStoredUtcToNycUtc(row.end_date) : null;

      const patch = {};
      if (hasStartDate && nextStart) {
        patch.start_date = nextStart;
      }
      if (hasEndDate && nextEnd) {
        patch.end_date = nextEnd;
      }
      if (hasTimezone) {
        patch.timezone = NYC_TIMEZONE;
      }

      if (Object.keys(patch).length === 0) {
        continue;
      }

      await knex('events').where({ id: row.id }).update(patch);
      changed += 1;
    }

    console.log(`[migration:fix-event-utc-to-nyc] updated ${changed} event rows`);
  },
};
