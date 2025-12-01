# Extension System Migration Guide

Guide for migrating from the old single-type extension system to the new component-based system.

## What Changed?

### Before (Old System)
- Single global `api::extension.extension` content type
- All extensions stored in one JSON field `list`
- No association with specific entities
- Difficult multi-tenancy

```typescript
// Old pattern
const extension = await strapi.documents('api::extension.extension').findOne();
const myExtensions = extension.list; // Array of all extensions for everyone
```

### After (New System)
- Reusable `common.extension` component
- Extensions scoped to specific entities (stores, subscribers, etc.)
- Proper multi-tenancy support
- Type-safe utilities

```typescript
// New pattern
const store = await strapi.documents('api::store.store').findOne({ documentId });
const myExtensions = store.extensions; // Only this store's extensions
```

## Migration Steps

### 1. Backup Existing Data

```bash
# Export existing extension data
curl -X GET "http://localhost:1337/api/extension" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  > extension_backup.json
```

### 2. Map Old Extensions to New Format

```typescript
// migration/migrate-extensions.ts

interface OldExtension {
  key: string;
  api_key?: string;
  url?: string;
  config?: any;
}

interface NewExtension {
  key: string;
  key_sec?: string;
  url?: string;
  data?: any;
  active: boolean;
  last_sync?: string;
}

async function migrateExtensions() {
  // Get old extension data
  const oldExtension = await strapi.documents('api::extension.extension').findOne();

  if (!oldExtension?.list) {
    console.log('[MIGRATION] No extensions to migrate');
    return;
  }

  const oldExtensions: OldExtension[] = oldExtension.list;

  // Get all stores (or other entities that need extensions)
  const stores = await strapi.documents('api::store.store').findMany({
    limit: -1
  });

  for (const store of stores) {
    const newExtensions: NewExtension[] = [];

    // Convert old extensions to new format
    for (const old of oldExtensions) {
      // Map old format to new format
      const newExt: NewExtension = {
        key: normalizeKey(old.key), // Ensure "namespace:service" format
        key_sec: old.api_key,
        url: old.url,
        data: old.config || {},
        active: true
      };

      newExtensions.push(newExt);
    }

    // Update store with new extensions
    await strapi.documents('api::store.store').update({
      documentId: store.documentId,
      data: { extensions: newExtensions }
    });

    console.log(`[MIGRATION] Migrated ${newExtensions.length} extensions for store ${store.documentId}`);
  }

  console.log('[MIGRATION] Migration complete');
}

function normalizeKey(key: string): string {
  // Convert old key format to new "namespace:service" format
  // Example: "odoo" -> "markket:odoo"

  if (key.includes(':')) {
    return key; // Already in correct format
  }

  // Add default namespace
  return `markket:${key}`;
}

// Run migration
migrateExtensions().catch(console.error);
```

### 3. Update Your Code

#### Before
```typescript
// Getting extensions
const extension = await strapi.documents('api::extension.extension').findOne();
const odooConfig = extension.list.find(e => e.key === 'odoo');

// Using extension
if (odooConfig) {
  await syncWithOdoo(odooConfig.url, odooConfig.api_key, odooConfig.config);
}
```

#### After
```typescript
import { findExtension } from '../services/extensions';

// Getting extensions
const store = await strapi.documents('api::store.store').findOne({
  documentId: storeId
});

const odooExt = findExtension(store.extensions, 'markket:odoo');

// Using extension
if (odooExt?.active) {
  await syncWithOdoo(odooExt.url, odooExt.key_sec, odooExt.data);
}
```

### 4. Update Middleware/Lifecycle Hooks

#### Before
```typescript
// Global extension access
const extension = await strapi.documents('api::extension.extension').findOne();
const webhooks = extension.list.filter(e => e.key.startsWith('webhook'));
```

#### After
```typescript
import { filterExtensions } from '../services/extensions';

// Entity-specific extension access
const store = await strapi.documents('api::store.store').findOne({
  documentId: order.store.documentId
});

const webhooks = filterExtensions(store.extensions, {
  namespace: 'sync',
  active: true
});
```

### 5. Clean Up (After Verification)

Once you've verified the migration worked:

```typescript
// Optional: Remove old extension content type
// Only do this after confirming all code is updated

// 1. Delete the old data
await strapi.documents('api::extension.extension').delete({ ... });

// 2. Remove the content type from your schema
// Delete: src/api/extension/content-types/extension/schema.json
```

## Key Naming Convention

The new system uses `namespace:service` format:

```typescript
// Old keys (may vary)
'odoo'
'shopify'
'webhook1'
'analytics'

// New keys (standardized)
'markket:odoo'
'markket:shopify'
'sync:webhook'
'analytics:mixpanel'
```

### Suggested Namespaces

- `markket:*` - Core Markket integrations (Odoo, Shopify, etc.)
- `sync:*` - Sync and webhook services
- `shipping:*` - Shipping providers (Shippo, EasyPost, etc.)
- `analytics:*` - Analytics services (Mixpanel, GA, etc.)
- `crm:*` - CRM systems (Salesforce, HubSpot, etc.)
- `payment:*` - Payment processors (beyond Stripe)
- `erp:*` - Custom ERP integrations

## Field Mapping

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `key` | `key` | Now uses `namespace:service` format |
| `api_key` | `key_sec` | Encrypted password type |
| `url` | `url` | Same |
| `config` | `data` | JSON type, more flexible |
| N/A | `active` | New - enable/disable toggle |
| N/A | `last_sync` | New - sync timestamp tracking |

## Example Migration Script

```typescript
// scripts/migrate-to-new-extensions.ts

import { upsertExtension } from '../src/services/extensions';

async function migrate() {
  try {
    // 1. Get old data
    const oldExt = await strapi.documents('api::extension.extension').findOne();

    if (!oldExt?.list) {
      console.log('No data to migrate');
      return;
    }

    // 2. Get all stores
    const stores = await strapi.documents('api::store.store').findMany({
      limit: -1
    });

    // 3. Migrate each store
    for (const store of stores) {
      let extensions = store.extensions || [];

      // Convert each old extension
      for (const old of oldExt.list) {
        const newExt = {
          key: old.key.includes(':') ? old.key : `markket:${old.key}`,
          key_sec: old.api_key,
          url: old.url,
          data: old.config || {},
          active: true
        };

        extensions = upsertExtension(extensions, newExt);
      }

      // Update store
      await strapi.documents('api::store.store').update({
        documentId: store.documentId,
        data: { extensions }
      });

      console.log(`✅ Migrated store ${store.slug}`);
    }

    console.log('✅ Migration complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run with: npm run strapi script scripts/migrate-to-new-extensions.ts
migrate();
```

## Verification Checklist

After migration:

- [ ] All stores have correct extensions
- [ ] Extension keys use `namespace:service` format
- [ ] Secrets are properly stored in `key_sec` field
- [ ] All integrations still work (test each one)
- [ ] Code updated to use new service utilities
- [ ] Middleware updated to access store-specific extensions
- [ ] Old extension content type backed up
- [ ] Documentation updated

## Rollback Plan

If you need to rollback:

1. Restore from backup JSON file
2. Re-create old `api::extension.extension` content type
3. Revert code changes
4. Remove `extensions` component from schemas

## Benefits of New System

✅ **Multi-tenancy** - Each store has its own extensions
✅ **Type Safety** - TypeScript types and validators
✅ **Flexibility** - Add to any content type
✅ **Security** - Encrypted password field for secrets
✅ **Scalability** - No single point of failure
✅ **Maintainability** - Cleaner data model

## Support

Questions? See:
- [Extension System README](./extension-system-readme.md)
- [Documentation](./extensions.md)
- [Usage Examples](./extension-examples.md)
