# Markkët Extensions

## Overview

Extensions in Markketplace serve two purposes:

1. **Extension Endpoints** - Special API endpoints that interact with markkët content and third party services
2. **Extension Component** - Reusable data component for flexible integration configurations

---

## Extension Component System (NEW)

The `common.extension` component provides a flexible, reusable way to attach integration configurations to any content type in Strapi v5.

### Schema Structure

```json
{
  "key": "namespace:service",        // Required, unique identifier (e.g., "markket:odoo")
  "key_sec": "encrypted-api-key",   // Optional, encrypted secret/API key
  "url": "https://api.example.com",  // Optional, service endpoint
  "data": { /* any JSON */ },        // Optional, flexible configuration
  "active": true,                    // Optional, defaults to true
  "last_sync": "2024-12-01T12:00:00Z" // Optional, ISO datetime
}
```

### Key Format Convention

The `key` field uses a **namespace:service** pattern:

- `markket:odoo` - Odoo integration
- `markket:shopify` - Shopify sync
- `sync:webhook` - Generic webhook
- `crm:salesforce` - Salesforce CRM
- `analytics:mixpanel` - Analytics tracking

**Format:** `^[a-z0-9]+:[a-z0-9-]+$` (lowercase alphanumeric and hyphens only)

### Quick Usage Example

```typescript
import { upsertExtension, findExtension } from '../services/extensions';

// Add Odoo integration to store
const odooConfig = {
  key: 'markket:odoo',
  key_sec: process.env.ODOO_API_KEY,
  url: 'https://your-odoo.com/api/v2',
  data: {
    database: 'production',
    sync_products: true,
    sync_orders: true
  },
  active: true
};

const store = await strapi.documents('api::store.store').findOne({
  documentId: storeId
});

const updatedExtensions = upsertExtension(store.extensions || [], odooConfig);

await strapi.documents('api::store.store').update({
  documentId: storeId,
  data: { extensions: updatedExtensions }
});

// Use the extension
const odoo = findExtension(store.extensions, 'markket:odoo');
if (odoo && odoo.active) {
  await syncWithOdoo(odoo.url, odoo.key_sec, odoo.data);
}
```

### Content Types with Extensions

Currently available on:
- ✅ `api::store.store`
- ✅ `api::subscriber.subscriber`

Can be added to any content type for integration needs.

### Service Utilities

See `/src/services/extensions.ts` for helper functions:
- `findExtension()` - Find by key
- `filterExtensions()` - Filter by namespace/service/active
- `upsertExtension()` - Create or update
- `updateLastSync()` - Update timestamp
- `validateExtension()` - Validate configuration

---

## Extension Endpoints

Special services designed to support email notifications, SMS, video calls and more.

Endpoints exist on this repo temporarily, to be abstracted when the implementation approach is confirmed and the complexity calls for it.

### Featuring

#### Stripe

Create payment links

Listen to webhooks

Update orders after succesful payment

#### Sendgrid email

Welcome email

Magic link

Reset password

Customizable templates

#### Strapi CMS

Limit data creation and perform cascade modifications
