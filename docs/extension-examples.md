# Extension System - Usage Examples

Complete examples for integrating external services using the `common.extension` component.

## Table of Contents

1. [Odoo Integration](#odoo-integration)
2. [Webhook Configuration](#webhook-configuration)
3. [Multi-Service Setup](#multi-service-setup)
4. [Sync Service Pattern](#sync-service-pattern)
5. [Security Best Practices](#security-best-practices)

---

## Odoo Integration

### Basic Setup

```typescript
import { upsertExtension, findExtension, updateLastSync } from '../services/extensions';

// Configure Odoo extension
async function setupOdooIntegration(storeId: string) {
  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId
  });

  const odooConfig = {
    key: 'markket:odoo',
    key_sec: process.env.ODOO_API_KEY,
    url: 'https://your-odoo-instance.com/api/v2',
    data: {
      database: 'production',
      username: 'integration_user',
      sync_products: true,
      sync_orders: true,
      sync_interval: 3600, // seconds
      category_mapping: {
        'electronics': 12,
        'clothing': 45,
        'books': 67
      }
    },
    active: true
  };

  const updatedExtensions = upsertExtension(store.extensions || [], odooConfig);

  await strapi.documents('api::store.store').update({
    documentId: storeId,
    data: { extensions: updatedExtensions }
  });

  console.log('[ODOO] Integration configured successfully');
}
```

### Sync Products to Odoo

```typescript
// services/odoo-product-sync.ts
import { findExtension, updateLastSync, getExtensionData } from './extensions';

interface OdooConfig {
  database: string;
  username: string;
  sync_products: boolean;
  category_mapping: Record<string, number>;
}

export async function syncProductToOdoo(productId: string, storeId: string) {
  // Get store with extensions
  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId
  });

  // Find Odoo extension
  const odoo = findExtension(store.extensions, 'markket:odoo');

  if (!odoo || !odoo.active) {
    console.log('[ODOO_SYNC] Extension not active, skipping');
    return null;
  }

  const config = getExtensionData<OdooConfig>(odoo);

  // Get product
  const product = await strapi.documents('api::product.product').findOne({
    documentId: productId
  });

  // Map to Odoo format
  const odooProduct = {
    name: product.Name,
    default_code: product.SKU,
    list_price: product.PRICES?.[0]?.unit_amount / 100 || 0,
    categ_id: config.category_mapping[product.category] || 1,
    type: 'product',
    sale_ok: true
  };

  try {
    // Send to Odoo
    const response = await fetch(`${odoo.url}/product.template`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${odoo.key_sec}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          database: config.database,
          model: 'product.template',
          method: 'create',
          args: [odooProduct]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Odoo API error: ${response.statusText}`);
    }

    const result = await response.json();

    // Update last sync
    const updatedExtensions = updateLastSync(store.extensions, 'markket:odoo');
    await strapi.documents('api::store.store').update({
      documentId: storeId,
      data: { extensions: updatedExtensions }
    });

    console.log('[ODOO_SYNC] Product synced successfully');
    return result;

  } catch (error) {
    console.error('[ODOO_SYNC] Failed to sync product:', error.message);
    throw error;
  }
}
```

### Auto-Sync with Middleware

```typescript
// middlewares/odoo-product-sync.ts
import { syncProductToOdoo } from '../services/odoo-product-sync';

export function registerOdooMiddleware({ strapi }: { strapi: any }) {
  strapi.documents.use(async (context: any, next: any) => {
    const result = await next();

    // Only sync on product creation/update
    if (context.uid !== 'api::product.product') {
      return result;
    }

    if (!['create', 'update'].includes(context.action)) {
      return result;
    }

    const product = result;
    const storeId = product.store?.documentId;

    if (!storeId) return result;

    // Async sync - don't block the response
    setImmediate(async () => {
      try {
        await syncProductToOdoo(product.documentId, storeId);
      } catch (error) {
        console.error('[ODOO_MIDDLEWARE] Sync failed:', error.message);
        // Continue gracefully - don't fail the original operation
      }
    });

    return result;
  });
}
```

---

## Webhook Configuration

### Setup Webhook Extension

```typescript
async function setupOrderWebhook(storeId: string) {
  const webhookConfig = {
    key: 'sync:order-webhook',
    url: 'https://external-service.com/webhooks/orders',
    key_sec: 'webhook-secret-token-abc123',
    data: {
      events: ['order.created', 'order.updated', 'order.fulfilled'],
      retry_attempts: 3,
      retry_delay: 1000, // ms
      timeout: 30000,
      headers: {
        'X-Custom-Header': 'custom-value',
        'X-Service-ID': 'markket-prod'
      }
    },
    active: true
  };

  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId
  });

  const updatedExtensions = upsertExtension(store.extensions || [], webhookConfig);

  await strapi.documents('api::store.store').update({
    documentId: storeId,
    data: { extensions: updatedExtensions }
  });
}
```

### Webhook Trigger Service

```typescript
// services/webhook-trigger.ts
import { filterExtensions, getExtensionData } from './extensions';

interface WebhookConfig {
  events: string[];
  retry_attempts: number;
  retry_delay: number;
  timeout: number;
  headers?: Record<string, string>;
}

export async function triggerWebhooks(
  storeId: string,
  event: string,
  payload: any
) {
  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId
  });

  // Get all active webhook extensions
  const webhooks = filterExtensions(store.extensions, {
    namespace: 'sync',
    active: true
  });

  const results = [];

  for (const webhook of webhooks) {
    const config = getExtensionData<WebhookConfig>(webhook);

    // Check if webhook handles this event
    if (!config.events?.includes(event)) {
      continue;
    }

    let attempts = 0;
    let success = false;

    while (attempts < config.retry_attempts && !success) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${webhook.key_sec}`,
            'Content-Type': 'application/json',
            ...config.headers
          },
          body: JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data: payload
          }),
          signal: AbortSignal.timeout(config.timeout)
        });

        if (response.ok) {
          success = true;
          console.log(`[WEBHOOK] Triggered successfully: ${webhook.key}`);
          results.push({ webhook: webhook.key, success: true });
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

      } catch (error) {
        attempts++;
        console.error(
          `[WEBHOOK] Attempt ${attempts} failed for ${webhook.key}:`,
          error.message
        );

        if (attempts < config.retry_attempts) {
          await new Promise(resolve => setTimeout(resolve, config.retry_delay));
        } else {
          results.push({ webhook: webhook.key, success: false, error: error.message });
        }
      }
    }
  }

  return results;
}
```

### Webhook Middleware

```typescript
// middlewares/webhook-trigger.ts
import { triggerWebhooks } from '../services/webhook-trigger';

export function registerWebhookMiddleware({ strapi }: { strapi: any }) {
  strapi.documents.use(async (context: any, next: any) => {
    const result = await next();

    // Trigger webhooks for orders
    if (context.uid === 'api::order.order') {
      const order = result;
      const storeId = order.store?.documentId;

      if (!storeId) return result;

      let event: string | null = null;

      if (context.action === 'create') {
        event = 'order.created';
      } else if (context.action === 'update') {
        if (order.status === 'fulfilled') {
          event = 'order.fulfilled';
        } else {
          event = 'order.updated';
        }
      }

      if (event) {
        setImmediate(async () => {
          try {
            await triggerWebhooks(storeId, event, order);
          } catch (error) {
            console.error('[WEBHOOK_MIDDLEWARE] Failed:', error.message);
          }
        });
      }
    }

    return result;
  });
}
```

---

## Multi-Service Setup

### Configure Multiple Integrations

```typescript
async function setupMultipleIntegrations(storeId: string) {
  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId
  });

  let extensions = store.extensions || [];

  // 1. Odoo ERP
  extensions = upsertExtension(extensions, {
    key: 'markket:odoo',
    key_sec: process.env.ODOO_API_KEY,
    url: 'https://odoo.example.com/api/v2',
    data: {
      database: 'production',
      sync_products: true,
      sync_orders: true
    },
    active: true
  });

  // 2. Shopify (disabled for now)
  extensions = upsertExtension(extensions, {
    key: 'markket:shopify',
    key_sec: process.env.SHOPIFY_TOKEN,
    url: 'https://my-shop.myshopify.com/admin/api/2024-01',
    data: {
      store_name: 'my-shop',
      sync_inventory: true,
      sync_collections: false
    },
    active: false  // Temporarily disabled
  });

  // 3. Analytics
  extensions = upsertExtension(extensions, {
    key: 'analytics:mixpanel',
    key_sec: process.env.MIXPANEL_TOKEN,
    data: {
      project_id: '12345',
      track_orders: true,
      track_pageviews: true
    },
    active: true
  });

  // 4. Shipping
  extensions = upsertExtension(extensions, {
    key: 'shipping:shippo',
    key_sec: process.env.SHIPPO_API_KEY,
    url: 'https://api.goshippo.com/v1',
    data: {
      default_carrier: 'usps',
      address_validation: true,
      test_mode: false
    },
    active: true
  });

  // 5. Webhook
  extensions = upsertExtension(extensions, {
    key: 'sync:external-webhook',
    url: 'https://external.com/webhook',
    key_sec: 'webhook-secret',
    data: {
      events: ['order.created', 'product.updated']
    },
    active: true
  });

  await strapi.documents('api::store.store').update({
    documentId: storeId,
    data: { extensions }
  });

  console.log('[SETUP] Configured 5 integrations');
}
```

### Query All Active Integrations

```typescript
import { filterExtensions, parseExtensionKey } from '../services/extensions';

async function getActiveIntegrations(storeId: string) {
  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId
  });

  const active = filterExtensions(store.extensions, { active: true });

  console.log('[INTEGRATIONS] Active integrations:');

  for (const ext of active) {
    const parsed = parseExtensionKey(ext.key);
    console.log(`  - ${ext.key} (${parsed.namespace}/${parsed.service})`);
    console.log(`    URL: ${ext.url || 'N/A'}`);
    console.log(`    Last sync: ${ext.last_sync || 'Never'}`);
  }

  return active;
}
```

---

## Sync Service Pattern

### Scheduled Sync Service

```typescript
// services/scheduled-sync.ts
import { filterExtensions, updateLastSync, getExtensionData } from './extensions';

interface SyncConfig {
  sync_interval: number; // seconds
  [key: string]: any;
}

export async function runScheduledSyncs() {
  // Get all stores
  const stores = await strapi.documents('api::store.store').findMany({
    limit: -1 // Get all
  });

  for (const store of stores) {
    const syncExtensions = filterExtensions(store.extensions, {
      active: true
    });

    for (const ext of syncExtensions) {
      const config = getExtensionData<SyncConfig>(ext);

      if (!config.sync_interval) continue;

      // Check if sync is due
      const lastSync = ext.last_sync ? new Date(ext.last_sync) : new Date(0);
      const now = new Date();
      const elapsedSeconds = (now.getTime() - lastSync.getTime()) / 1000;

      if (elapsedSeconds >= config.sync_interval) {
        console.log(`[SCHEDULED_SYNC] Running sync for ${ext.key}`);

        try {
          // Route to appropriate sync function
          if (ext.key === 'markket:odoo') {
            await syncStoreWithOdoo(store.documentId, ext);
          } else if (ext.key === 'markket:shopify') {
            await syncStoreWithShopify(store.documentId, ext);
          }

          // Update timestamp
          const updated = updateLastSync(store.extensions, ext.key);
          await strapi.documents('api::store.store').update({
            documentId: store.documentId,
            data: { extensions: updated }
          });

        } catch (error) {
          console.error(`[SCHEDULED_SYNC] Failed for ${ext.key}:`, error.message);
        }
      }
    }
  }
}

// Run every 5 minutes
setInterval(runScheduledSyncs, 5 * 60 * 1000);
```

---

## Security Best Practices

### Never Log Secrets

```typescript
// ❌ NEVER DO THIS
console.log('Extension:', extension); // Contains key_sec!
console.log('API Key:', extension.key_sec);

// ✅ ALWAYS DO THIS
console.log('[SERVICE] Extension configured:', {
  key: extension.key,
  hasApiKey: !!extension.key_sec,
  hasUrl: !!extension.url,
  active: extension.active,
  lastSync: extension.last_sync
});
```

### Validate Before Using

```typescript
import { validateExtension } from '../services/extensions';

const validation = validateExtension(extension);

if (!validation.valid) {
  console.error('[VALIDATION] Extension invalid:', validation.errors);
  return;
}

// Safe to use
await performSync(extension);
```

### Environment Variables

```typescript
// ✅ Store secrets in environment variables
const extension = {
  key: 'markket:odoo',
  key_sec: process.env.ODOO_API_KEY,  // Not hardcoded
  url: process.env.ODOO_URL,
  data: {
    database: process.env.ODOO_DATABASE
  }
};
```

### Rate Limiting

```typescript
const syncDebounce = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 2000; // 2 seconds

function debouncedSync(extensionKey: string, syncFn: () => Promise<void>) {
  const existing = syncDebounce.get(extensionKey);

  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(async () => {
    try {
      await syncFn();
    } catch (error) {
      console.error(`[SYNC] Failed for ${extensionKey}:`, error.message);
    } finally {
      syncDebounce.delete(extensionKey);
    }
  }, DEBOUNCE_DELAY);

  syncDebounce.set(extensionKey, timeout);
}
```

### Error Boundaries

```typescript
async function safeSync(extension: Extension, syncFn: (ext: Extension) => Promise<void>) {
  try {
    await syncFn(extension);
    return { success: true };
  } catch (error) {
    console.error(`[SYNC] Failed for ${extension.key}:`, error.message);

    // Don't throw - graceful degradation
    return { success: false, error: error.message };
  }
}
```

---

## Testing Extensions

### Create Test Extension

```typescript
const testExtension = {
  key: 'test:mock-service',
  url: 'http://localhost:3001/webhook',
  key_sec: 'test-secret-123',
  data: {
    test_mode: true,
    debug: true
  },
  active: true
};

const extensions = upsertExtension([], testExtension);
console.log('Test extension created:', extensions);
```

### Verify Extension Format

```typescript
import { validateExtension, isValidExtensionKey } from '../services/extensions';

const tests = [
  { key: 'markket:odoo', valid: true },
  { key: 'Markket:Odoo', valid: false },  // Uppercase
  { key: 'markket_odoo', valid: false },  // Underscore
  { key: 'markket:odoo-v2', valid: true }, // Hyphen OK
  { key: 'markket', valid: false },        // Missing service
];

tests.forEach(test => {
  const result = isValidExtensionKey(test.key);
  console.log(`${test.key}: ${result === test.valid ? '✅' : '❌'}`);
});
```
