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

    // Build a map of storeId → Set of linked userIds
    const usersByStoreId = new Map();
    for (const link of links) {
      const storeId = Number(link?.[linkStoreColumn]);
      const userId = Number(link?.[linkUserColumn]);
      if (!Number.isFinite(storeId) || !Number.isFinite(userId)) continue;

      const existing = usersByStoreId.get(storeId) || new Set();
      existing.add(userId);
      usersByStoreId.set(storeId, existing);
    }

    // Pre-fetch all existing memberships to avoid N+1 checks
    const existingMemberships = await knex('store_memberships')
      .select([membershipStoreColumn, membershipUserColumn]);
    const membershipKey = (storeId, userId) => `${storeId}:${userId}`;
    const existingKeys = new Set(
      existingMemberships.map(m => membershipKey(m[membershipStoreColumn], m[membershipUserColumn]))
    );

    let membershipCreates = 0;
    let ownerSkipped = 0;

    for (const store of stores) {
      const storeId = Number(store?.[storeIdColumn]);
      if (!Number.isFinite(storeId)) continue;

      const linkedUsers = Array.from(usersByStoreId.get(storeId) || []);
      if (!linkedUsers.length) continue;

      const existingOwnerId = Number(store?.[ownerColumn]) || null;

      // Only set owner_id if it's already known — never guess from linked users
      // (the lowest-ID user is not reliably the owner)
      if (!existingOwnerId) {
        ownerSkipped += 1;
      }

      const ownerId = existingOwnerId;

      for (const userId of linkedUsers) {
        if (existingKeys.has(membershipKey(storeId, userId))) continue;

        // eslint-disable-next-line no-await-in-loop
        await knex('store_memberships').insert({
          [membershipStoreColumn]: storeId,
          [membershipUserColumn]: userId,
          role: ownerId && userId === ownerId ? 'owner' : 'editor',
          status: 'active',
          joined_at: new Date().toISOString(),
          created_at: new Date(),
          updated_at: new Date(),
        });
        existingKeys.add(membershipKey(storeId, userId));
        membershipCreates += 1;
      }
    }

    console.log(`[migration:backfill-store-owners-and-memberships] created ${membershipCreates} memberships, ${ownerUpdates} owner updates, ${ownerSkipped} stores skipped (no owner set — requires manual review)`);
  },
};