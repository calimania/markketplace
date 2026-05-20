'use strict';

const SHOW_KEYS = [
  'show_blog',
  'show_events',
  'show_shop',
  'show_about',
  'show_newsletter',
  'show_home',
];

const MAGIC_SLUGS = {
  about: ['about', 'acerca', 'sobre', 'nosotros'],
  blog: ['blog', 'articles', 'articulos', 'noticias'],
  shop: ['products', 'shop', 'tienda', 'catalogo'],
  events: ['events', 'eventos', 'calendario'],
  newsletter: ['newsletter', 'subscribe', 'suscribirse'],
  home: ['home', 'inicio', 'portada'],
};

function parseMeta(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function pickStoreColumn(columns) {
  if (columns.store_id !== undefined) return 'store_id';
  if (columns.stores_id !== undefined) return 'stores_id';
  return null;
}

function pickEntityColumn(columns, candidates) {
  for (const name of candidates) {
    if (columns[name] !== undefined) return name;
  }
  return null;
}

function pickIdColumn(columns) {
  if (columns.id !== undefined) return 'id';
  if (columns.document_id !== undefined) return 'document_id';
  return null;
}

function pickSettingsRefColumn(columns) {
  const candidates = ['settings_id', 'store_setting_id', 'store_settings_id'];
  for (const candidate of candidates) {
    if (columns[candidate] !== undefined) return candidate;
  }
  return null;
}

function pickSettingsMetaColumn(columns) {
  if (columns.meta !== undefined) return 'meta';
  return null;
}

async function fetchRowsByIds(knex, table, idColumn, ids, selectedColumns) {
  if (!ids.length) {
    return [];
  }

  return knex(table)
    .whereIn(idColumn, ids)
    .select(selectedColumns);
}

async function createSettingAndGetId(knex, payload, settingsIdColumn) {
  const inserted = await knex('store_settings')
    .insert(payload)
    .returning(settingsIdColumn);

  if (Array.isArray(inserted) && inserted.length > 0) {
    const first = inserted[0];
    if (typeof first === 'object' && first !== null) {
      return first[settingsIdColumn];
    }
    return first;
  }

  return null;
}

async function pickExistingTable(knex, candidates) {
  for (const table of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasTable(table)) {
      return table;
    }
  }
  return null;
}

async function countByStoreId(knex, table, storeIdColumn, storeId) {
  return knex(table).where(storeIdColumn, storeId).count({ c: '*' }).first().then((row) => Number(row?.c || 0));
}

async function countManyToManyByStoreId(knex, linkTable, storeIdColumn, entityIdColumn, storeId) {
  return knex(linkTable)
    .where(storeIdColumn, storeId)
    .countDistinct({ c: entityIdColumn })
    .first()
    .then((row) => Number(row?.c || 0));
}

module.exports = {
  async up(knex) {
    const hasStores = await knex.schema.hasTable('stores');
    const hasSettings = await knex.schema.hasTable('store_settings');
    const hasPages = await knex.schema.hasTable('pages');
    const hasArticles = await knex.schema.hasTable('articles');

    if (!hasStores || !hasSettings) {
      console.log('[migration:backfill-store-visibility-navigation] stores/store_settings table missing; skipping');
      return;
    }

    const productLinkTable = await pickExistingTable(knex, [
      'products_stores_lnk',
      'products_store_lnk',
      'stores_products_lnk',
      'store_products_lnk',
    ]);

    const eventLinkTable = await pickExistingTable(knex, [
      'events_stores_lnk',
      'events_store_lnk',
      'stores_events_lnk',
      'store_events_lnk',
    ]);

    const storeColumns = await knex('stores').columnInfo();
    const storeIdColumn = pickIdColumn(storeColumns);
    const storeSettingsRefColumn = pickSettingsRefColumn(storeColumns);

    if (!storeIdColumn) {
      console.log('[migration:backfill-store-visibility-navigation] store id column missing; skipping');
      return;
    }

    const storeSelectColumns = [storeIdColumn, ...(storeSettingsRefColumn ? [storeSettingsRefColumn] : [])];
    const stores = await knex('stores').select(storeSelectColumns);
    if (!stores.length) {
      console.log('[migration:backfill-store-visibility-navigation] no stores found; skipping');
      return;
    }

    const settingsColumns = await knex('store_settings').columnInfo();
    const settingsIdColumn = pickIdColumn(settingsColumns);
    const settingsMetaColumn = pickSettingsMetaColumn(settingsColumns);
    const settingsStoreColumn = pickStoreColumn(settingsColumns);

    if (!settingsIdColumn || !settingsMetaColumn) {
      console.log('[migration:backfill-store-visibility-navigation] store_settings id/meta columns missing; skipping');
      return;
    }

    const storeSettingsLinkTable = await pickExistingTable(knex, [
      'store_settings_store_lnk',
      'store_setting_store_lnk',
      'store_store_settings_lnk',
      'stores_store_settings_lnk',
      'store_settings_stores_lnk',
      'store_setting_stores_lnk',
    ]);

    let linkStoreColumn = null;
    let linkSettingsColumn = null;
    if (storeSettingsLinkTable) {
      const linkColumns = await knex(storeSettingsLinkTable).columnInfo();
      linkStoreColumn = pickStoreColumn(linkColumns);
      linkSettingsColumn = pickEntityColumn(linkColumns, [
        'store_setting_id',
        'store_settings_id',
        'settings_id',
      ]);
    }

    const settingsByStoreId = new Map();
    if (settingsStoreColumn) {
      const settingsRows = await knex('store_settings').select([settingsIdColumn, settingsStoreColumn, settingsMetaColumn]);
      for (const row of settingsRows) {
        const storeId = row?.[settingsStoreColumn];
        if (storeId != null) {
          settingsByStoreId.set(Number(storeId), {
            id: row[settingsIdColumn],
            meta: row[settingsMetaColumn],
          });
        }
      }
    } else if (storeSettingsRefColumn) {
      const storeSettingIds = Array.from(new Set(
        stores
          .map((store) => store?.[storeSettingsRefColumn])
          .filter((value) => value != null)
      ));

      const settingsRows = await fetchRowsByIds(
        knex,
        'store_settings',
        settingsIdColumn,
        storeSettingIds,
        [settingsIdColumn, settingsMetaColumn]
      );

      const settingsById = new Map();
      for (const row of settingsRows) {
        settingsById.set(row[settingsIdColumn], {
          id: row[settingsIdColumn],
          meta: row[settingsMetaColumn],
        });
      }

      for (const store of stores) {
        const storeId = Number(store[storeIdColumn]);
        const settingsId = store?.[storeSettingsRefColumn];
        if (settingsId == null) continue;
        const settingsRow = settingsById.get(settingsId);
        if (settingsRow) {
          settingsByStoreId.set(storeId, settingsRow);
        }
      }
    } else if (storeSettingsLinkTable && linkStoreColumn && linkSettingsColumn) {
      const linkRows = await knex(storeSettingsLinkTable).select([linkStoreColumn, linkSettingsColumn]);
      const linkedSettingIds = Array.from(new Set(
        linkRows.map((row) => row?.[linkSettingsColumn]).filter((value) => value != null)
      ));

      const settingsRows = await fetchRowsByIds(
        knex,
        'store_settings',
        settingsIdColumn,
        linkedSettingIds,
        [settingsIdColumn, settingsMetaColumn]
      );

      const settingsById = new Map();
      for (const row of settingsRows) {
        settingsById.set(row[settingsIdColumn], {
          id: row[settingsIdColumn],
          meta: row[settingsMetaColumn],
        });
      }

      for (const link of linkRows) {
        const storeId = Number(link?.[linkStoreColumn]);
        const settingsId = link?.[linkSettingsColumn];
        if (!Number.isFinite(storeId) || settingsId == null) continue;
        const settingsRow = settingsById.get(settingsId);
        if (settingsRow) {
          settingsByStoreId.set(storeId, settingsRow);
        }
      }
    }

    const pageColumns = hasPages ? await knex('pages').columnInfo() : {};
    const pageStoreColumn = hasPages ? pickStoreColumn(pageColumns) : null;
    const pageSlugColumn = hasPages && pageColumns.slug !== undefined ? 'slug' : null;
    const pageActiveColumn = hasPages
      ? (pageColumns.active !== undefined ? 'active' : (pageColumns.Active !== undefined ? 'Active' : null))
      : null;

    const articleColumns = hasArticles ? await knex('articles').columnInfo() : {};
    const articleStoreColumn = hasArticles ? pickStoreColumn(articleColumns) : null;

    let productStoreColumn = null;
    let productEntityColumn = null;
    if (productLinkTable) {
      const columns = await knex(productLinkTable).columnInfo();
      productStoreColumn = pickStoreColumn(columns);
      productEntityColumn = pickEntityColumn(columns, ['product_id', 'products_id']);
    }

    let eventStoreColumn = null;
    let eventEntityColumn = null;
    if (eventLinkTable) {
      const columns = await knex(eventLinkTable).columnInfo();
      eventStoreColumn = pickStoreColumn(columns);
      eventEntityColumn = pickEntityColumn(columns, ['event_id', 'events_id']);
    }

    let updatedSettings = 0;
    let createdSettings = 0;

    for (const store of stores) {
      const storeId = Number(store[storeIdColumn]);
      // eslint-disable-next-line no-await-in-loop
      const pagesCount = (hasPages && pageStoreColumn)
        ? await countByStoreId(knex, 'pages', pageStoreColumn, storeId)
        : 0;

      // eslint-disable-next-line no-await-in-loop
      const articlesCount = (hasArticles && articleStoreColumn)
        ? await countByStoreId(knex, 'articles', articleStoreColumn, storeId)
        : 0;

      // eslint-disable-next-line no-await-in-loop
      const productsCount = (productLinkTable && productStoreColumn && productEntityColumn)
        ? await countManyToManyByStoreId(knex, productLinkTable, productStoreColumn, productEntityColumn, storeId)
        : 0;

      // eslint-disable-next-line no-await-in-loop
      const eventsCount = (eventLinkTable && eventStoreColumn && eventEntityColumn)
        ? await countManyToManyByStoreId(knex, eventLinkTable, eventStoreColumn, eventEntityColumn, storeId)
        : 0;

      const foundSlugs = new Set();
      if (hasPages && pageStoreColumn && pageSlugColumn) {
        let pageQuery = knex('pages')
          .where(pageStoreColumn, storeId)
          .whereIn(pageSlugColumn, Object.values(MAGIC_SLUGS).flat())
          .select([pageSlugColumn]);

        if (pageActiveColumn) {
          pageQuery = pageQuery.andWhere(pageActiveColumn, true);
        }

        // eslint-disable-next-line no-await-in-loop
        const pageRows = await pageQuery;
        for (const row of pageRows) {
          const slug = String(row?.[pageSlugColumn] || '').toLowerCase().trim();
          if (slug) {
            foundSlugs.add(slug);
          }
        }
      }

      const hasAboutPage = MAGIC_SLUGS.about.some((slug) => foundSlugs.has(slug));
      const hasBlogPage = MAGIC_SLUGS.blog.some((slug) => foundSlugs.has(slug));
      const hasShopPage = MAGIC_SLUGS.shop.some((slug) => foundSlugs.has(slug));
      const hasEventsPage = MAGIC_SLUGS.events.some((slug) => foundSlugs.has(slug));
      const hasNewsletterPage = MAGIC_SLUGS.newsletter.some((slug) => foundSlugs.has(slug));
      const hasHomePage = MAGIC_SLUGS.home.some((slug) => foundSlugs.has(slug));

      const fallbackVisibility = {
        show_blog: hasBlogPage || articlesCount > 0 || pagesCount > 0,
        show_events: hasEventsPage || eventsCount > 0,
        show_shop: hasShopPage || productsCount > 0,
        show_about: hasAboutPage || pagesCount > 0,
        show_newsletter: hasNewsletterPage,
        show_home: hasHomePage || pagesCount > 0,
      };

      const settingsRow = settingsByStoreId.get(storeId) || null;
      const currentMeta = parseMeta(settingsRow?.meta);
      const currentNavigation = (currentMeta.navigation && typeof currentMeta.navigation === 'object')
        ? { ...currentMeta.navigation }
        : {};

      let changed = false;
      for (const key of SHOW_KEYS) {
        if (typeof currentNavigation[key] !== 'boolean') {
          currentNavigation[key] = fallbackVisibility[key];
          changed = true;
        }
      }

      if (!settingsRow) {
        const nextMeta = {
          ...currentMeta,
          navigation: currentNavigation,
        };

        if (settingsStoreColumn) {
          // eslint-disable-next-line no-await-in-loop
          await knex('store_settings').insert({
            [settingsStoreColumn]: storeId,
            [settingsMetaColumn]: nextMeta,
          });
          createdSettings += 1;
          continue;
        }

        if (storeSettingsRefColumn) {
          // eslint-disable-next-line no-await-in-loop
          const insertedId = await createSettingAndGetId(knex, {
            [settingsMetaColumn]: nextMeta,
          }, settingsIdColumn);

          if (insertedId != null) {
            // eslint-disable-next-line no-await-in-loop
            await knex('stores').where({ [storeIdColumn]: storeId }).update({
              [storeSettingsRefColumn]: insertedId,
            });
            createdSettings += 1;
          }
          continue;
        }

        if (storeSettingsLinkTable && linkStoreColumn && linkSettingsColumn) {
          // eslint-disable-next-line no-await-in-loop
          const insertedId = await createSettingAndGetId(knex, {
            [settingsMetaColumn]: nextMeta,
          }, settingsIdColumn);

          if (insertedId != null) {
            // eslint-disable-next-line no-await-in-loop
            await knex(storeSettingsLinkTable).insert({
              [linkStoreColumn]: storeId,
              [linkSettingsColumn]: insertedId,
            });
            createdSettings += 1;
          }
          continue;
        }

        console.warn('[migration:backfill-store-visibility-navigation] no writable store-settings relation strategy found for store', { storeId });
        continue;
      }

      if (!changed) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await knex('store_settings').where({ [settingsIdColumn]: settingsRow.id }).update({
        [settingsMetaColumn]: {
          ...currentMeta,
          navigation: currentNavigation,
        },
      });
      updatedSettings += 1;
    }

    console.log('[migration:backfill-store-visibility-navigation] complete', {
      stores: stores.length,
      updatedSettings,
      createdSettings,
      productLinkTable,
      eventLinkTable,
      storeSettingsLinkTable,
    });
  },
};
