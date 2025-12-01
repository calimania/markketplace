# Extension System

A flexible, reusable component system for managing external service integrations in Strapi v5.

## Quick Start

```typescript
import { upsertExtension, findExtension } from './services/extensions';

// 1. Add an integration
const odoo = {
  key: 'markket:odoo',
  key_sec: process.env.ODOO_API_KEY,
  url: 'https://odoo.example.com/api',
  data: { database: 'production', sync_products: true },
  active: true
};

const store = await strapi.documents('api::store.store').findOne({ documentId });
const extensions = upsertExtension(store.extensions || [], odoo);
await strapi.documents('api::store.store').update({ documentId, data: { extensions } });

// 2. Use the integration
const odooExt = findExtension(store.extensions, 'markket:odoo');
if (odooExt?.active) {
  await syncWithOdoo(odooExt.url, odooExt.key_sec, odooExt.data);
}
```

## Files

- **Component Schema**: `src/components/common/extension.json`
- **Service Utilities**: `src/services/extensions.ts`
- **Type Definitions**: `src/services/extension-types.ts`
- **Documentation**: `docs/extensions.md`
- **Examples**: `docs/extension-examples.md`

## Key Features

✅ **Flexible Schema** - JSON data field for arbitrary configuration
✅ **Secure Storage** - Encrypted password field for API keys
✅ **Namespace Pattern** - `namespace:service` key format (e.g., `markket:odoo`)
✅ **Active/Inactive** - Toggle integrations without deletion
✅ **Sync Tracking** - `last_sync` timestamp for monitoring
✅ **Type Safety** - TypeScript types and validators

## Schema Structure

```typescript
{
  key: string;           // "namespace:service" format (required)
  key_sec?: string;      // Encrypted API key/secret
  url?: string;          // Service endpoint URL
  data?: any;            // Flexible JSON configuration
  active?: boolean;      // Enable/disable (default: true)
  last_sync?: string;    // ISO datetime of last sync
}
```

## Available On

- ✅ `api::store.store`
- ✅ `api::subscriber.subscriber`
- Can be added to any content type

## Common Integrations

| Key | Description |
|-----|-------------|
| `markket:odoo` | Odoo ERP integration |
| `markket:shopify` | Shopify sync |
| `sync:webhook` | Generic webhook |
| `shipping:shippo` | Shippo shipping |
| `analytics:mixpanel` | Mixpanel analytics |
| `crm:salesforce` | Salesforce CRM |

## Utility Functions

```typescript
// Find extension by key
findExtension(extensions, 'markket:odoo')

// Filter by namespace or service
filterExtensions(extensions, { namespace: 'markket', active: true })

// Create or update
upsertExtension(extensions, newExtension)

// Remove by key
removeExtension(extensions, 'markket:odoo')

// Update sync timestamp
updateLastSync(extensions, 'markket:odoo')

// Validate configuration
validateExtension(extension)

// Type-safe data access
getExtensionData<OdooConfig>(extension)
```

## Documentation

- **[Full Documentation](./docs/extensions.md)** - Complete guide and API reference
- **[Usage Examples](./docs/extension-examples.md)** - Real-world integration examples
- **[AGENTS.md](./AGENTS.md)** - AI agent guidelines (includes extension patterns)

## Examples

### Odoo Integration
```typescript
{
  key: 'markket:odoo',
  key_sec: 'api-key',
  url: 'https://odoo.example.com/api',
  data: {
    database: 'production',
    sync_products: true,
    category_mapping: { 'electronics': 12 }
  }
}
```

### Webhook
```typescript
{
  key: 'sync:order-webhook',
  url: 'https://external.com/webhook',
  key_sec: 'secret-token',
  data: {
    events: ['order.created', 'order.fulfilled'],
    retry_attempts: 3
  }
}
```

### Shipping Service
```typescript
{
  key: 'shipping:shippo',
  key_sec: 'shippo-api-key',
  url: 'https://api.goshippo.com/v1',
  data: {
    default_carrier: 'usps',
    address_validation: true
  }
}
```

## Security Best Practices

1. **Never log secrets** - Use structured logging without sensitive fields
2. **Environment variables** - Store credentials in `.env`, not code
3. **Validate inputs** - Use `validateExtension()` before operations
4. **Rate limiting** - Implement debouncing for frequent syncs
5. **Error boundaries** - Graceful degradation on failures

## Migration from Single Extension Type

If you previously used the `api::extension.extension` single type with a JSON list:

```typescript
// Old pattern
const extension = await strapi.documents('api::extension.extension').findOne();
const odooConfig = extension.list.find(e => e.key === 'odoo');

// New pattern - directly on content type
const store = await strapi.documents('api::store.store').findOne({ documentId });
const odooExt = findExtension(store.extensions, 'markket:odoo');
```

Benefits:
- ✅ Scoped to specific stores/entities
- ✅ No global singleton
- ✅ Better multi-tenancy support
- ✅ Cleaner data model

## Contributing

When adding new integrations:

1. Use proper `namespace:service` key format
2. Document configuration in `extension-types.ts`
3. Add examples to `extension-examples.md`
4. Follow security guidelines in `AGENTS.md`
5. Test with validation utilities

## Support

For questions or issues:
- See documentation in `docs/extensions.md`
- Check examples in `docs/extension-examples.md`
- Review code patterns in `AGENTS.md`
