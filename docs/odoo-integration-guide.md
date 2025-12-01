# Odoo Integration Guide

**Pattern**: Default Markket Odoo + Customer-Specific Instances
**Status**: Schema ready, implementation in future PR

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Markket Platform                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Store A (no custom Odoo)                                    │
│  └─ Extension: markket:odoo:newsletter                       │
│     ├─ credentials: { use_default: true }                    │
│     └─ Syncs to → Markket's Odoo                            │
│                                                               │
│  Store B (no custom Odoo)                                    │
│  └─ Extension: markket:odoo:product                          │
│     ├─ credentials: { use_default: true }                    │
│     └─ Syncs to → Markket's Odoo                            │
│                                                               │
│  Store C (custom Odoo)                                       │
│  └─ Extension: markket:odoo:product                          │
│     ├─ credentials: {                                        │
│     │   database: "acme_prod",                               │
│     │   username: "acme_integration",                        │
│     │   api_key: "customer_key_here"                         │
│     │ }                                                       │
│     ├─ url: "https://acme-odoo.example.com/api"             │
│     └─ Syncs to → Customer's Odoo                           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Default Markket Odoo Setup

### Configuration

All stores without custom Odoo credentials automatically sync to Markket's central Odoo instance.

**Environment Variables** (`.env`):
```bash
# Markket's default Odoo instance
ODOO_DEFAULT_URL=https://markket-odoo.example.com/api/v2
ODOO_DEFAULT_DATABASE=markket_production
ODOO_DEFAULT_USERNAME=integration_user
ODOO_DEFAULT_API_KEY=your_default_odoo_api_key_here
```

### Extension Examples

#### 1. Newsletter Sync (Default Odoo)

Every new subscriber gets added to Markket's centralized newsletter in Odoo.

```json
{
  "key": "markket:odoo:newsletter",
  "triggers": ["trigger:new_subscriber"],
  "credentials": {
    "use_default": true
  },
  "config": {
    "mailing_list_id": 1,
    "auto_subscribe": true,
    "send_welcome": false,
    "tags": ["markket_platform", "newsletter"]
  },
  "active": true
}
```

**Extension Handler** (future implementation):
```typescript
// src/extensions/markket/odoo/newsletter.ts

export default async function handler({ entity, credentials, config, url, meta }) {
  // If use_default, load from environment
  const odooConfig = credentials.use_default ? {
    url: process.env.ODOO_DEFAULT_URL,
    database: process.env.ODOO_DEFAULT_DATABASE,
    username: process.env.ODOO_DEFAULT_USERNAME,
    api_key: process.env.ODOO_DEFAULT_API_KEY
  } : {
    url: url || credentials.url,
    database: credentials.database,
    username: credentials.username,
    api_key: credentials.api_key
  };

  // Add subscriber to Odoo mailing list
  const response = await fetch(`${odooConfig.url}/mailing.contact`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${odooConfig.api_key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        database: odooConfig.database,
        model: 'mailing.contact',
        method: 'create',
        args: [{
          email: entity.Email,
          list_ids: [[6, 0, [config.mailing_list_id]]],
          tag_ids: [[6, 0, config.tags.map(tag => getTagId(tag))]]
        }]
      }
    })
  });

  const result = await response.json();

  // Return updated meta with Odoo contact ID for future updates
  return {
    success: true,
    message: 'Subscriber added to Odoo newsletter',
    meta: {
      ...meta, // Preserve existing meta data
      odoo_contact_id: result.result,
      odoo_mailing_list_id: config.mailing_list_id,
      last_sync_at: new Date().toISOString(),
      sync_status: 'success'
    }
  };
}
```

#### 2. Store Creation Sync (Default Odoo)

When a new store is created on Markket, create it in Markket's Odoo as a partner/customer.

```json
{
  "key": "markket:odoo:store",
  "triggers": ["trigger:store_created"],
  "credentials": {
    "use_default": true
  },
  "config": {
    "create_as_partner": true,
    "partner_type": "customer",
    "default_category": "markket_stores",
    "sync_logo": true,
    "sync_addresses": true
  },
  "active": true
}
```

**What gets synced**:
- Store name → Partner name
- Store description → Partner notes
- Store addresses → Partner addresses
- Store logo → Partner image
- Store metadata → Custom fields

#### 3. Product Catalog Sync (Default Odoo)

All products from all stores sync to Markket's central Odoo for analytics and inventory tracking.

```json
{
  "key": "markket:odoo:product",
  "triggers": ["trigger:product_created", "trigger:product_updated"],
  "credentials": {
    "use_default": true
  },
  "config": {
    "sync_to_central": true,
    "create_product_template": true,
    "sync_pricing": true,
    "sync_inventory": true,
    "category_prefix": "markket_",
    "store_field": "x_markket_store_id"
  },
  "active": true
}
```

#### 4. Order Tracking (Default Odoo)

All orders sync to Markket's Odoo for analytics, fulfillment tracking, and reporting.

```json
{
  "key": "markket:odoo:order",
  "triggers": ["trigger:post_sale"],
  "credentials": {
    "use_default": true
  },
  "config": {
    "create_sale_order": true,
    "auto_confirm": true,
    "create_invoice": false,
    "sync_shipments": true,
    "store_field": "x_markket_store_id"
  },
  "active": true
}
```

---

## Customer-Specific Odoo Setup

### When to Use

Some customers may have their own Odoo instances and want direct integration:

- **Enterprise customers** with existing Odoo ERP
- **White-label stores** needing independent systems
- **Multi-location businesses** with their own infrastructure
- **Custom workflows** requiring specific Odoo configurations

### Configuration

Customer provides their Odoo credentials, and their store extensions use those instead of defaults.

#### Example: ACME Corp with Custom Odoo

```json
{
  "key": "markket:odoo:product",
  "triggers": ["trigger:product_created", "trigger:product_updated"],
  "credentials": {
    "database": "acme_production",
    "username": "acme_markket_integration",
    "api_key": "acme_specific_api_key_here"
  },
  "config": {
    "customer_id": "acme_corp",
    "sync_images": true,
    "custom_field_mapping": {
      "internal_sku": "x_internal_sku",
      "vendor_code": "x_vendor",
      "cost_center": "x_cost_center"
    },
    "category_mapping": {
      "electronics": 42,
      "accessories": 43,
      "software": 44
    },
    "warehouse_id": 5
  },
  "url": "https://acme-odoo.example.com/api/v2",
  "active": true
}
```

**Key differences**:
- No `use_default: true` flag
- Full credentials provided
- Custom URL specified
- Customer-specific field mappings
- Customer-specific category IDs

---

## Multi-Level Strategy

A single store can have BOTH default and custom Odoo extensions:

```json
[
  {
    "key": "markket:odoo:newsletter",
    "triggers": ["trigger:new_subscriber"],
    "credentials": { "use_default": true },
    "config": { "mailing_list_id": 1 },
    "active": true
  },
  {
    "key": "markket:odoo:product",
    "triggers": ["trigger:product_updated"],
    "credentials": {
      "database": "customer_db",
      "api_key": "customer_key"
    },
    "url": "https://customer-odoo.com/api",
    "active": true
  }
]
```

**Result**:
- Newsletter subscribers → Markket's Odoo (centralized marketing)
- Products → Customer's Odoo (their inventory system)

---

## Default Odoo Use Cases

### 1. Centralized Newsletter Marketing

All stores' subscribers → One Markket mailing list

**Benefits**:
- Cross-store campaigns
- Platform-wide newsletters
- Unified subscriber management
- Analytics across all stores

**Extension**:
```json
{
  "key": "markket:odoo:newsletter",
  "triggers": ["trigger:new_subscriber"],
  "credentials": { "use_default": true },
  "config": { "mailing_list_id": 1 },
  "active": true
}
```

### 2. Platform Analytics

Track all sales, products, stores in central Odoo

**Benefits**:
- Platform-wide reporting
- Trend analysis
- Revenue tracking
- Inventory insights

**Extensions**:
```json
[
  {
    "key": "markket:odoo:store",
    "triggers": ["trigger:store_created"],
    "credentials": { "use_default": true }
  },
  {
    "key": "markket:odoo:product",
    "triggers": ["trigger:product_created"],
    "credentials": { "use_default": true }
  },
  {
    "key": "markket:odoo:order",
    "triggers": ["trigger:post_sale"],
    "credentials": { "use_default": true }
  }
]
```

### 3. Centralized Support/CRM

All customer support tickets, interactions in one place

**Extension**:
```json
{
  "key": "markket:odoo:support",
  "triggers": ["trigger:new_subscriber", "trigger:post_sale"],
  "credentials": { "use_default": true },
  "config": {
    "create_lead": true,
    "auto_assign": false,
    "team_id": 3
  }
}
```

### 4. Marketplace Fulfillment

Markket handles fulfillment for smaller stores

**Extension**:
```json
{
  "key": "markket:odoo:fulfillment",
  "triggers": ["trigger:post_sale"],
  "credentials": { "use_default": true },
  "config": {
    "warehouse_id": 1,
    "create_picking": true,
    "auto_validate": false
  }
}
```

---

## Implementation Patterns (Future PR)

### Credentials Resolution

```typescript
// src/services/odoo-credentials.ts

export function resolveOdooCredentials(extension: Extension) {
  // Check if using default Odoo
  if (extension.credentials?.use_default) {
    return {
      url: process.env.ODOO_DEFAULT_URL,
      database: process.env.ODOO_DEFAULT_DATABASE,
      username: process.env.ODOO_DEFAULT_USERNAME,
      api_key: process.env.ODOO_DEFAULT_API_KEY
    };
  }

  // Use custom credentials
  return {
    url: extension.url || extension.credentials.url,
    database: extension.credentials.database,
    username: extension.credentials.username,
    api_key: extension.credentials.api_key
  };
}
```

### Store Namespace Isolation

Even when using default Odoo, data is namespaced by store:

```typescript
// src/extensions/markket/odoo/product.ts

export default async function handler({ entity, credentials, config }) {
  const odooConfig = resolveOdooCredentials({ credentials });

  // Add store context to Odoo records
  const productData = {
    name: entity.Name,
    default_code: entity.SKU,
    list_price: entity.usd_price,
    // Namespace by store
    x_markket_store_id: entity.stores?.[0]?.documentId,
    x_markket_store_slug: entity.stores?.[0]?.slug,
    x_markket_product_id: entity.documentId
  };

  // Create in Odoo
  await createOdooProduct(odooConfig, productData);
}
```

### Migration Helper

Easily migrate stores from default → custom Odoo:

```typescript
async function migrateToCustomOdoo(
  storeId: string,
  customerOdooConfig: {
    url: string;
    database: string;
    username: string;
    api_key: string;
  }
) {
  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId
  });

  // Update extensions to use custom Odoo
  const updatedExtensions = store.extensions.map(ext => {
    if (ext.key.startsWith('markket:odoo')) {
      return {
        ...ext,
        credentials: {
          database: customerOdooConfig.database,
          username: customerOdooConfig.username,
          api_key: customerOdooConfig.api_key
        },
        url: customerOdooConfig.url
      };
    }
    return ext;
  });

  await strapi.documents('api::store.store').update({
    documentId: storeId,
    data: { extensions: updatedExtensions }
  });

  console.log('[MIGRATION] Store migrated to custom Odoo');
}
```

---

## Security Considerations

### Default Credentials
- ✅ Stored in environment variables (`.env`)
- ✅ Never exposed in API responses
- ✅ Separate test/production keys
- ✅ Rotated regularly

### Customer Credentials
- ✅ Encrypted at rest in database
- ✅ Never logged
- ✅ Customer-managed rotation
- ✅ Validated before use

### API Keys
```typescript
// Never log credentials
console.log('[ODOO] Syncing product'); // ✅ Good
console.log('[ODOO] Using credentials:', credentials); // ❌ NEVER

// Log metadata only
console.log('[ODOO] Sync config:', {
  useDefault: !!credentials.use_default,
  hasCustomUrl: !!url,
  hasDatabase: !!credentials.database
}); // ✅ Good
```

---

## Example Store Configurations

### Scenario 1: New Small Store

Uses all default Markket Odoo services:

```json
{
  "extensions": [
    {
      "key": "markket:odoo:newsletter",
      "triggers": ["trigger:new_subscriber"],
      "credentials": { "use_default": true },
      "active": true
    },
    {
      "key": "markket:odoo:product",
      "triggers": ["trigger:product_updated"],
      "credentials": { "use_default": true },
      "active": true
    },
    {
      "key": "markket:odoo:order",
      "triggers": ["trigger:post_sale"],
      "credentials": { "use_default": true },
      "active": true
    }
  ]
}
```

### Scenario 2: Enterprise Customer

Uses their own Odoo for products/orders, but Markket's for newsletter:

```json
{
  "extensions": [
    {
      "key": "markket:odoo:newsletter",
      "triggers": ["trigger:new_subscriber"],
      "credentials": { "use_default": true },
      "active": true
    },
    {
      "key": "markket:odoo:product",
      "triggers": ["trigger:product_updated"],
      "credentials": {
        "database": "enterprise_db",
        "username": "integration",
        "api_key": "enterprise_key"
      },
      "url": "https://enterprise-odoo.com/api",
      "active": true
    },
    {
      "key": "markket:odoo:order",
      "triggers": ["trigger:post_sale"],
      "credentials": {
        "database": "enterprise_db",
        "username": "integration",
        "api_key": "enterprise_key"
      },
      "url": "https://enterprise-odoo.com/api",
      "active": true
    }
  ]
}
```

### Scenario 3: Hybrid Setup

Different Odoo instances for different purposes:

```json
{
  "extensions": [
    {
      "key": "markket:odoo:newsletter",
      "triggers": ["trigger:new_subscriber"],
      "credentials": { "use_default": true },
      "config": { "mailing_list_id": 1 }
    },
    {
      "key": "markket:odoo:product",
      "triggers": ["trigger:product_updated"],
      "credentials": { "use_default": true }
    },
    {
      "key": "markket:odoo:fulfillment",
      "triggers": ["trigger:post_sale"],
      "credentials": {
        "database": "warehouse_system",
        "api_key": "warehouse_key"
      },
      "url": "https://warehouse-odoo.com/api"
    }
  ]
}
```

---

## Getting Started

### 1. Set Up Default Odoo (Markket Admin)

```bash
# .env
ODOO_DEFAULT_URL=https://markket-odoo.example.com/api/v2
ODOO_DEFAULT_DATABASE=markket_production
ODOO_DEFAULT_USERNAME=integration_user
ODOO_DEFAULT_API_KEY=your_api_key_here
```

### 2. Add Default Extensions to Stores

All new stores automatically get these extensions:

```typescript
// When store is created
const defaultExtensions = [
  {
    key: 'markket:odoo:newsletter',
    triggers: ['trigger:new_subscriber'],
    credentials: { use_default: true },
    active: true
  },
  {
    key: 'markket:odoo:product',
    triggers: ['trigger:product_updated'],
    credentials: { use_default: true },
    active: true
  }
];

await strapi.documents('api::store.store').update({
  documentId: newStore.documentId,
  data: { extensions: defaultExtensions }
});
```

### 3. Offer Custom Odoo (Optional)

For enterprise customers, provide form to add custom credentials:

```typescript
// Admin UI or API endpoint
async function setupCustomerOdoo(storeId, customerConfig) {
  const customExtension = {
    key: 'markket:odoo:product',
    triggers: ['trigger:product_updated'],
    credentials: {
      database: customerConfig.database,
      username: customerConfig.username,
      api_key: customerConfig.api_key
    },
    url: customerConfig.url,
    active: true
  };

  // Add to store's extensions
  await addExtensionToStore(storeId, customExtension);
}
```

---

This pattern gives you maximum flexibility: centralized by default, distributed on demand! 🎯
