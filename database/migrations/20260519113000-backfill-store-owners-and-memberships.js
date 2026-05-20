'use strict';

async function pickExistingTable(knex, candidates) {
  for (const table of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasTable(table)) {
      return table;
    }
  }
  return null;
}

function pickIdColumn(columns) {
  if (columns.id !== undefined) return 'id';
  if (columns.document_id !== undefined) return 'document_id';
  return null;
}

function pickStoreColumn(columns) {
  if (columns.store_id !== undefined) return 'store_id';
  if (columns.stores_id !== undefined) return 'stores_id';
  return null;
}

function pickUserColumn(columns) {
  if (columns.user_id !== undefined) return 'user_id';
  if (columns.users_id !== undefined) return 'users_id';
  return null;
}

function pickOwnerColumn(columns) {
  if (columns.owner_id !== undefined) return 'owner_id';
  return null;
}

module.exports = {
  async up(knex) {
    const hasStores = await knex.schema.hasTable('stores');
    const hasMemberships = await knex.schema.hasTable('store_memberships');

    if (!hasStores || !hasMemberships) {
      console.log('[migration:backfill-store-owners-and-memberships] stores/store_memberships table missing; skipping');
      return;
    }

    const storesColumns = await knex('stores').columnInfo();
    const storeIdColumn = pickIdColumn(storesColumns);
    const ownerColumn = pickOwnerColumn(storesColumns);

    if (!storeIdColumn || !ownerColumn) {
      console.log('[migration:backfill-store-owners-and-memberships] required store columns missing; skipping');
      return;
    }

    const membershipColumns = await knex('store_memberships').columnInfo();
    const membershipStoreColumn = pickStoreColumn(membershipColumns);
    const membershipUserColumn = pickUserColumn(membershipColumns);

    if (!membershipStoreColumn || !membershipUserColumn) {
      console.log('[migration:backfill-store-owners-and-memberships] membership relation columns missing; skipping');
      return;
    }

    const storeUserLinkTable = await pickExistingTable(knex, [
      'stores_users_lnk',
      'store_users_lnk',
      'up_users_stores_lnk',
      'up_users_store_lnk'
    ]);

    if (!storeUserLinkTable) {
      console.log('[migration:backfill-store-owners-and-memberships] store-user link table missing; skipping');
      return;
    }

    const linkColumns = await knex(storeUserLinkTable).columnInfo();
    const linkStoreColumn = pickStoreColumn(linkColumns);
    const linkUserColumn = pickUserColumn(linkColumns);

    if (!linkStoreColumn || !linkUserColumn) {
      console.log('[migration:backfill-store-owners-and-memberships] store-user link columns missing; skipping');
      return;
    }

    const stores = await knex('stores').select([storeIdColumn, ownerColumn]);
    const links = await knex(storeUserLinkTable).select([linkStoreColumn, linkUserColumn]);

    const usersByStoreId = new Map();
    for (const link of links) {
      const storeId = Number(link?.[linkStoreColumn]);
      const userId = Number(link?.[linkUserColumn]);
      if (!Number.isFinite(storeId) || !Number.isFinite(userId)) continue;

      const existing = usersByStoreId.get(storeId) || [];
      if (!existing.includes(userId)) {
        existing.push(userId);
        existing.sort((left, right) => left - right);
      }
      usersByStoreId.set(storeId, existing);
    }

    let ownerUpdates = 0;
    let membershipCreates = 0;

    for (const store of stores) {
      const storeId = Number(store?.[storeIdColumn]);
      if (!Number.isFinite(storeId)) continue;

      const linkedUsers = usersByStoreId.get(storeId) || [];
      if (!linkedUsers.length) continue;

      const ownerId = Number(store?.[ownerColumn]) || linkedUsers[0];

      if (!Number(store?.[ownerColumn])) {
        // eslint-disable-next-line no-await-in-loop
        await knex('stores').where({ [storeIdColumn]: storeId }).update({ [ownerColumn]: ownerId });
        ownerUpdates += 1;
      }

      for (const userId of linkedUsers) {
        // eslint-disable-next-line no-await-in-loop
        const existingMembership = await knex('store_memberships')
          .where({ [membershipStoreColumn]: storeId, [membershipUserColumn]: userId })
          .first();

        if (existingMembership) {
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await knex('store_memberships').insert({
          [membershipStoreColumn]: storeId,
          [membershipUserColumn]: userId,
          role: userId === ownerId ? 'owner' : 'editor',
          status: 'active',
          joined_at: new Date().toISOString(),
          created_at: new Date(),
          updated_at: new Date(),
        });
        membershipCreates += 1;
      }
    }

    console.log(`[migration:backfill-store-owners-and-memberships] updated ${ownerUpdates} owners and created ${membershipCreates} memberships`);
  },
};