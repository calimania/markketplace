# Markkët Extensions

## Overview

Extensions in Markketplace provide a flexible integration system:

1. **Extension Component** - Reusable data storage for integration configs (credentials, settings, metadata)
2. **Extension Handlers** - Implementation logic
3. **Encryption Service** - Secure credential storage using AES-256-CBC

**Architecture Pattern:**

- **Strapi** - Stores extension configurations (schema only, no business logic)
- **markket** - Implements extension handlers as routes
- Extensions can push to external services (Odoo, Sendgrid) or respond to webhooks

---

## Extension Component System

The `common.extension` component provides a flexible, reusable way to attach integration configurations to any content type

### Schema Structure

```json
{
  "key": "namespace:class:method",    // Required, maps to handler (e.g., "markket:odoo:newsletter")
  "triggers": ["trigger:subscriber_create"], // Event-based activation
  "credentials": {                   // Encrypted sensitive data (api_key, password, token)
    "use_default": false,
    "api_key": "encrypted:abc123...",
    "username": "api_user"            // Plain, searchable
  },
  "config": {                        // Plain settings (searchable, non-sensitive)
    "mailing_list_id": 123,
    "tags": ["newsletter", "customer"]
  },
  "url": "https://api.example.com",  // Optional, service endpoint
  "active": true,                    // Defaults to true
  "last_run": "2024-12-01T12:00:00Z",
  "run_count": 42,
  "meta": {                          // Runtime/sync data (odoo IDs, execution logs)
    "odoo_contact_id": 456,
    "last_sync_status": "success"
  }
}
```

**Field Usage:**
- `credentials` - Encrypted API keys, passwords, tokens (use encryption service)
- `config` - Plain settings, IDs, options (searchable in database)
- `meta` - Runtime state, external IDs, sync metadata (updated by handlers)
- `url` - Service endpoint (can be plain or omitted if using default)

### Key Format Convention

The `key` field uses a **namespace:class:method** pattern that maps to handler files:

**Two-segment (service-level):**
- `markket:odoo` - Platform Odoo integration
- `markket:stripe` - Stripe payment sync

**Three-segment (method-level, recommended):**
- `markket:odoo:newsletter` → `markket-next/extensions/markket/odoo/newsletter.ts`
- `markket:odoo:campaign` → `markket-next/extensions/markket/odoo/campaign.ts`
- `markket:sendgrid:webhook` → `markket-next/extensions/markket/sendgrid/webhook.ts`

**Format:** `^[a-z0-9]+:[a-z0-9-]+(?::[a-z0-9-]+)?$`

This pattern allows extension handlers to live in organized file structures in `markket-next`.

### Quick Usage Example

**Storing Extension with Encryption (Strapi side):**

```typescript
import { encryptCredentials } from '../services/encryption';

// Add Odoo integration to subscriber
const rawCredentials = {
  use_default: false,
  url: 'https://customer-odoo.com',
  database: 'customer_db',
  username: 'api_user',
  api_key: 'plain_text_key_here' // Will be encrypted
};

const extension = {
  key: 'markket:odoo:newsletter',
  triggers: ['trigger:subscriber_create'],
  credentials: encryptCredentials(rawCredentials), // Encrypts api_key field
  config: {
    mailing_list_id: 123,
    tags: ['newsletter', 'customer']
  },
  active: true
};

await strapi.documents('api::subscriber.subscriber').update({
  documentId: subscriberId,
  data: { extensions: [extension] }
});
```

**Using Extension (markket-next handler side):**

```typescript
// markket-next/extensions/markket/odoo/newsletter.ts
import { decryptCredentials } from '@/lib/encryption'; // Copy encryption.ts to markket-next

export default async function handler({ entity, extension, meta }) {
  // Decrypt credentials
  const creds = decryptCredentials(extension.credentials);

  // Use decrypted api_key
  const response = await fetch(`${creds.url}/mailing.contact`, {
    headers: {
      'Authorization': `Bearer ${creds.api_key}`, // Now decrypted
    },
    body: JSON.stringify({
      database: creds.database,
      email: entity.Email,
      list_ids: [[6, 0, [extension.config.mailing_list_id]]]
    })
  });

  const result = await response.json();

  // Return updated meta for Strapi to save
  return {
    success: true,
    meta: {
      ...meta,
      odoo_contact_id: result.result,
      last_sync_at: new Date().toISOString()
    }
  };
}
```

### Content Types with Extensions

Currently available on:

- `api::store.store` - Store-level integrations (default Odoo, payment gateways)
- `api::subscriber.subscriber` - Subscriber sync (newsletter, CRM)
- `api::product.product` - Product sync (inventory, pricing)
- `api::event.event` - Event integrations (calendar, ticketing)
- `api::order.order` - Order fulfillment (shipping, accounting)
- `common.prices` component - Price-specific extensions

Extensions are a repeatable component - any content type can have multiple extensions.

### Service Utilities

**Encryption Service** (`/src/services/encryption.ts`):
- `encrypt(text)` - Encrypt single value (returns IV:data)
- `decrypt(text)` - Decrypt single value
- `encryptCredentials(obj)` - Auto-encrypt sensitive fields (api_key, password, token)
- `decryptCredentials(obj)` - Auto-decrypt sensitive fields
- `generateKey()` - Generate ENCRYPTION_KEY for .env

**Extension Helpers** (future):
- `findExtension(extensions, key)` - Find by key
- `filterByTrigger(extensions, trigger)` - Get extensions for event
- `executeExtension(extension, context)` - Call markket-next handler

---

## Extension Handlers (markket-next)

**New Architecture:** Extension business logic lives in `markket-next` Next.js app, not in Strapi.

**Benefits:**
- ✅ Keeps Strapi lean (schema + data only)
- ✅ Next.js API routes are easy to deploy and scale
- ✅ Developers can customize handlers without touching Strapi
- ✅ Extensions can be Next.js endpoints that receive webhooks or push to external services

**Handler Pattern:**

```typescript
// markket-next/app/api/extensions/[namespace]/[class]/[method]/route.ts

export async function POST(request: Request) {
  const { entity, extension, meta } = await request.json();

  // Your extension logic here
  const result = await yourIntegration(entity, extension);

  // Return updated meta for Strapi to persist
  return Response.json({
    success: true,
    meta: { ...meta, updated_field: result }
  });
}
```

**Extension Execution Flow:**

1. Strapi triggers extension (create/update event)
2. Strapi middleware calls url: `POST markket-next/api/odoo/newsletter`
3. Handler executes, returns updated meta
4. Strapi saves meta back to extension

This keeps the implementation flexible and the Strapi codebase focused on data management.

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



# Extension Schema Design

**Status**: Schema-only (v1.0) - Implementation PR will follow
**Branch**: `feat/common-extensions`

This document describes the extension system schema designed to support flexible integrations with external services (Odoo, Stripe, Sendgrid, PostHog, custom webhooks, etc.).

---

## Schema Structure

```json
{
  "key": "namespace:class:method",
  "triggers": ["event1", "event2"],
  "credentials": { /* flexible JSON */ },
  "config": { /* flexible JSON */ },
  "url": "https://...",
  "active": true,
  "last_run": "2025-12-01T12:00:00Z",
  "run_count": 42,
  "meta": { /* runtime/sync data */ }
}
```

### Field Definitions

#### `key` (string, required)
Unique identifier mapping to extension code location.

**Format**: `namespace:class:method` or `namespace:class`

**Regex**: `^[a-z0-9]+:[a-z0-9-]+(?::[a-z0-9-]+)?$`

**Examples**:
- `markket:odoo` → Runs `markket/odoo/index` method
- `markket:odoo:newsletter` → Runs `markket/odoo/newsletter` method
- `markket:stripe:subscription` → Runs `markket/stripe/subscription` method
- `markket:sendgrid:welcome` → Runs `markket/sendgrid/welcome` method
- `custom:webhook` → Generic webhook handler
- `posthog:track` → PostHog analytics tracking

**Namespace Conventions**:
- `markket:*` - Core Markket extensions (in our repo)
- `custom:*` - Custom/generic handlers (webhooks, etc.)
- `external:*` - Future: npm packages or external URLs

#### `triggers` (JSON array, optional)
Array of event strings that activate this extension.

**Default**: `[]` (manual only)

**Examples**:
```json
// Store extension - run on new subscriber
["trigger:new_subscriber"]

// Store extension - run on multiple events
["trigger:post_sale", "trigger:order_fulfilled"]

// Product extension - run on stock changes
["trigger:inventory_low", "trigger:inventory_zero"]

// Price extension - run on Stripe events
["trigger:stripe_subscription_created", "trigger:stripe_subscription_updated"]

// Generic - run on any order event
["trigger:order_*"]
```

**Event Naming Convention**: `trigger:domain_action`
- Domain: `new`, `post`, `pre`, `order`, `product`, `subscriber`, `inventory`, `stripe`, etc.
- Action: `sale`, `created`, `updated`, `fulfilled`, `low`, `zero`, etc.

#### `credentials` (JSON object, optional)
Flexible object for authentication data. Replaces single `key_sec` string.

**Examples**:
```json
// Simple API key
{
  "api_key": "sk_live_abc123"
}

// OAuth credentials
{
  "client_id": "abc123",
  "client_secret": "xyz789",
  "access_token": "token_here",
  "refresh_token": "refresh_here"
}

// Odoo instance credentials
{
  "database": "production",
  "username": "integration_user",
  "api_key": "odoo_key_here"
}

// Stripe credentials with mode
{
  "live_key": "sk_live_...",
  "test_key": "sk_test_...",
  "webhook_secret": "whsec_..."
}

// Webhook signature
{
  "secret": "webhook_secret_123",
  "algorithm": "sha256"
}
```

#### `config` (JSON object, optional)
Non-sensitive configuration data. Replaces `data` field for clarity.

**Examples**:
```json
// Odoo sync configuration
{
  "sync_products": true,
  "sync_orders": true,
  "sync_interval": 3600,
  "category_mapping": {
    "electronics": 12,
    "clothing": 45
  }
}

// Email configuration
{
  "template_id": "d-abc123",
  "from_email": "noreply@markket.place",
  "reply_to": "support@markket.place"
}

// Subscription tiers
{
  "tier": "premium",
  "features": ["newsletter", "priority_support"],
  "send_welcome_kit": true
}

// Webhook configuration
{
  "method": "POST",
  "headers": {
    "X-Custom-Header": "value"
  },
  "retry_attempts": 3
}
```

#### `url` (string, optional)
External endpoint URL for webhooks or remote extensions.

**Examples**:
- `https://odoo.example.com/api/v2`
- `https://customer-erp.com/webhook`
- `https://api.external-extension.io/v1/run` (future npm package)

#### `active` (boolean, default: true)
Enable/disable extension without deletion.

#### `last_run` (datetime, optional)
ISO timestamp of last successful execution. Replaces `last_sync`.

#### `run_count` (integer, default: 0)
Total number of times extension has been executed. Useful for monitoring and debugging.

#### `meta` (JSON object, optional)
Runtime/sync metadata storage. Extension can write arbitrary data here.

**Use cases**:
- Store external IDs (Odoo record IDs, Sendgrid contact IDs, etc.)
- Track sync state and progress
- Store error logs and retry information
- Keep execution history
- Cache frequently-accessed data

**Examples**:
```json
// Odoo newsletter sync metadata
{
  "odoo_mailing_list_id": 5,
  "odoo_contact_ids": {
    "subscriber_abc123": 456,
    "subscriber_def456": 789
  },
  "last_sync_status": "success",
  "last_error": null,
  "total_contacts_synced": 1250
}

// Stripe subscription metadata
{
  "stripe_product_id": "prod_abc123",
  "stripe_price_ids": {
    "monthly": "price_monthly_xyz",
    "yearly": "price_yearly_xyz"
  },
  "last_webhook_received": "2025-12-01T12:00:00Z",
  "subscription_count": 45
}

// Campaign execution metadata
{
  "odoo_campaign_id": 123,
  "sendgrid_batch_id": "batch_abc",
  "sent_count": 1200,
  "failed_recipients": ["bounce@example.com"],
  "execution_log": [
    {
      "timestamp": "2025-12-01T10:00:00Z",
      "status": "started",
      "recipients": 1200
    },
    {
      "timestamp": "2025-12-01T10:15:00Z",
      "status": "completed",
      "delivered": 1150
    }
  ]
}

// Error tracking
{
  "error_count": 3,
  "last_errors": [
    {
      "timestamp": "2025-11-30T14:00:00Z",
      "error": "Odoo API timeout",
      "retry_in": 300
    }
  ],
  "retry_after": "2025-11-30T14:05:00Z"
}
```

**Important**: `meta` is mutable and written by extension execution. Don't store sensitive data here (use `credentials` instead).

---

## Content Types with Extensions

### Currently Enabled

1. **`api::store.store`**
   - Store-level integrations (Odoo, webhooks, analytics)
   - Example triggers: `new_subscriber`, `post_sale`, `order_fulfilled`, `store_created`

2. **`api::subscriber.subscriber`**
   - Subscriber-specific extensions (custom workflows)
   - Example triggers: `email_verified`, `subscription_upgraded`

3. **`api::product.product`**
   - Product-level integrations (inventory sync, price updates)
   - Example triggers: `inventory_low`, `price_changed`, `product_published`, `product_created`

4. **`api::event.event`**
   - Event-specific integrations (ticket sales, capacity alerts, reminders)
   - Example triggers: `event_created`, `event_sold_out`, `event_starting_soon`, `rsvp_confirmed`

5. **`api::order.order`**
   - Order-specific extensions (fulfillment, shipping, notifications)
   - Example triggers: `post_sale`, `order_fulfilled`, `order_shipped`, `order_refunded`

6. **`common.prices` component**
   - Price-specific extensions (Stripe subscriptions, tiered pricing)
   - Example triggers: `stripe_subscription_created`, `price_tier_changed`

### Easy to Add Later
- `api::category.category` - Category sync
- `api::rsvp.rsvp` - RSVP-specific workflows
- `api::shipment.shipment` - Shipping integrations
- Any other content type

---

## Extension Key Patterns

### Core Markket Extensions (in our repo)

```typescript
// Odoo integrations
"markket:odoo"                    // Generic Odoo sync (index method)
"markket:odoo:newsletter"         // Newsletter-specific sync
"markket:odoo:product"            // Product sync
"markket:odoo:order"              // Order sync
"markket:odoo:inventory"          // Inventory sync

// Stripe integrations
"markket:stripe:subscription"     // Subscription handling
"markket:stripe:invoice"          // Invoice processing
"markket:stripe:webhook"          // Stripe webhook handler

// Sendgrid email
"markket:sendgrid:welcome"        // Welcome email
"markket:sendgrid:newsletter"     // Newsletter
"markket:sendgrid:order_confirm"  // Order confirmation
"markket:sendgrid:shipping"       // Shipping notification

// PostHog analytics
"posthog:track"                   // Event tracking
"posthog:identify"                // User identification
"posthog:feature_flag"            // Feature flag check
```

### Custom/Generic Extensions

```typescript
// Webhooks
"custom:webhook"                  // Generic webhook POST
"custom:webhook:authenticated"    // Webhook with auth header

// Customer-specific
"customer:acme:erp"              // ACME Corp's ERP integration
"customer:widgets:inventory"      // Widgets Inc inventory sync
```

### Future: External Extensions

```typescript
// npm packages (future)
"npm:markket-odoo-premium:sync"  // Premium Odoo package
"npm:third-party-crm:contact"    // Third-party CRM package

// External URLs (future)
"external:microservice:process"   // External microservice
```

---

## Usage Examples

### Store Extension: Odoo Sync on New Subscriber

```json
{
  "key": "markket:odoo:newsletter",
  "triggers": ["trigger:new_subscriber"],
  "credentials": {
    "database": "production",
    "username": "integration_user",
    "api_key": "odoo_api_key_here"
  },
  "config": {
    "list_id": 5,
    "auto_subscribe": true,
    "send_welcome": true,
    "tags": ["markket", "newsletter"]
  },
  "url": "https://odoo.example.com/api/v2",
  "active": true
}
```

**Extension Runner Logic** (future PR):
```typescript
// When subscriber is created
const triggers = ['trigger:new_subscriber'];
const extensions = findByTriggers(store.extensions, triggers);

for (const ext of extensions) {
  if (!ext.active) continue;

  // Parse key: "markket:odoo:newsletter"
  const [namespace, className, method] = ext.key.split(':');

  // Resolve to: src/extensions/markket/odoo/newsletter.ts
  const handler = await import(`./extensions/${namespace}/${className}/${method}`);

  // Execute
  await handler.default({
    subscriber,
    credentials: ext.credentials,
    config: ext.config,
    url: ext.url
  });

  // Update metadata
  await updateExtension(ext.id, {
    last_run: new Date(),
    run_count: ext.run_count + 1
  });
}
```

### Store Extension: Multiple Post-Sale Actions

```json
[
  {
    "key": "markket:odoo:order",
    "triggers": ["trigger:post_sale"],
    "credentials": { "api_key": "..." },
    "config": { "create_invoice": true },
    "url": "https://odoo.example.com/api",
    "active": true
  },
  {
    "key": "markket:sendgrid:order_confirm",
    "triggers": ["trigger:post_sale"],
    "credentials": { "api_key": "SG...." },
    "config": {
      "template_id": "d-abc123",
      "include_receipt": true
    },
    "active": true
  },
  {
    "key": "posthog:track",
    "triggers": ["trigger:post_sale"],
    "credentials": { "api_key": "phc_..." },
    "config": {
      "event_name": "order_completed",
      "include_products": true
    },
    "active": true
  },
  {
    "key": "custom:webhook",
    "triggers": ["trigger:post_sale"],
    "credentials": { "secret": "webhook_secret" },
    "config": { "method": "POST" },
    "url": "https://customer-system.com/webhook/order",
    "active": true
  }
]
```

### Product Extension: Inventory Alerts

```json
{
  "key": "markket:sendgrid:inventory_alert",
  "triggers": ["trigger:inventory_low"],
  "credentials": { "api_key": "SG...." },
  "config": {
    "template_id": "d-low-stock",
    "recipients": ["admin@markket.place"],
    "threshold": 5
  },
  "active": true
}
```

### Price Extension: Stripe Subscription Tiers

```json
{
  "key": "markket:stripe:subscription",
  "triggers": ["trigger:stripe_subscription_created"],
  "credentials": {
    "live_key": "sk_live_...",
    "test_key": "sk_test_...",
    "webhook_secret": "whsec_..."
  },
  "config": {
    "tier": "premium",
    "features": ["newsletter", "priority_support", "early_access"],
    "billing_cycle": "monthly",
    "trial_days": 14
  },
  "active": true
}
```

### Customer-Specific Odoo Instance

```json
{
  "key": "markket:odoo:product",
  "triggers": ["trigger:product_updated"],
  "credentials": {
    "database": "customer_db",
    "username": "customer_integration",
    "api_key": "customer_specific_key"
  },
  "config": {
    "customer_id": "acme_corp",
    "sync_images": true,
    "custom_fields": {
      "internal_sku": "x_internal_sku",
      "vendor": "x_vendor_code"
    }
  },
  "url": "https://acme-odoo.example.com/api",
  "active": true
}
```

---

## Trigger Event Catalog

### Order/Sale Events
- `trigger:pre_sale` - Before order created
- `trigger:post_sale` - After order created
- `trigger:order_created` - Order created
- `trigger:order_updated` - Order updated
- `trigger:order_fulfilled` - Order marked fulfilled
- `trigger:order_cancelled` - Order cancelled
- `trigger:order_refunded` - Order refunded

### Subscriber Events
- `trigger:new_subscriber` - New subscriber created
- `trigger:subscriber_verified` - Email verified
- `trigger:subscriber_unsubscribed` - Unsubscribed

### Product Events
- `trigger:product_created` - New product
- `trigger:product_updated` - Product updated
- `trigger:product_published` - Product published
- `trigger:product_unpublished` - Product unpublished
- `trigger:inventory_low` - Stock below threshold
- `trigger:inventory_zero` - Out of stock
- `trigger:inventory_restocked` - Back in stock

### Price Events
- `trigger:price_created` - New price
- `trigger:price_updated` - Price changed
- `trigger:price_tier_changed` - Pricing tier updated

### Stripe Events
- `trigger:stripe_subscription_created`
- `trigger:stripe_subscription_updated`
- `trigger:stripe_subscription_cancelled`
- `trigger:stripe_invoice_paid`
- `trigger:stripe_payment_failed`

### Generic Events
- `trigger:*` - Match any trigger (use carefully)
- Custom events can be defined as needed

---

## Extension Runner Architecture (Future PR)

### File Structure
```
src/
├── extensions/
│   ├── markket/
│   │   ├── odoo/
│   │   │   ├── index.ts           # Generic sync (markket:odoo)
│   │   │   ├── newsletter.ts      # Newsletter sync (markket:odoo:newsletter)
│   │   │   ├── product.ts         # Product sync (markket:odoo:product)
│   │   │   ├── order.ts           # Order sync (markket:odoo:order)
│   │   │   └── inventory.ts       # Inventory sync (markket:odoo:inventory)
│   │   ├── stripe/
│   │   │   ├── subscription.ts    # Subscription handler
│   │   │   ├── invoice.ts         # Invoice processing
│   │   │   └── webhook.ts         # Webhook handler
│   │   └── sendgrid/
│   │       ├── welcome.ts         # Welcome email
│   │       ├── newsletter.ts      # Newsletter
│   │       ├── order_confirm.ts   # Order confirmation
│   │       └── shipping.ts        # Shipping notification
│   ├── posthog/
│   │   ├── track.ts               # Event tracking
│   │   ├── identify.ts            # User identification
│   │   └── feature_flag.ts        # Feature flags
│   └── custom/
│       ├── webhook.ts             # Generic webhook
│       └── webhook-authenticated.ts
├── services/
│   ├── extension-runner.ts        # Core runner logic
│   ├── extension-resolver.ts      # Key → file resolver
│   └── extension-triggers.ts      # Trigger matching
└── middlewares/
    └── extension-middleware.ts     # Auto-trigger on events
```

### Extension Handler Interface (Future)
```typescript
// Each extension exports this interface
export default async function handler({
  entity,      // The triggering entity (store, product, order, etc.)
  trigger,     // The trigger event that fired
  credentials, // ext.credentials object
  config,      // ext.config object
  url,         // ext.url string
  context      // Additional context (user, strapi instance, etc.)
}: ExtensionContext): Promise<ExtensionResult> {
  // Extension logic here

  return {
    success: true,
    message: 'Processed successfully',
    data: { /* optional return data */ }
  };
}
```

---

## Migration Notes

### Changes from Previous Version

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `key` regex | `key` regex | Now supports optional third segment (`namespace:class:method`) |
| `key_sec` (password) | `credentials` (JSON) | More flexible for complex auth |
| `data` (JSON) | `config` (JSON) | Renamed for clarity (non-sensitive config) |
| N/A | `triggers` (JSON array) | NEW - Event-based activation |
| `last_sync` | `last_run` | Renamed for clarity |
| N/A | `run_count` (integer) | NEW - Execution tracking |
| N/A | `meta` (JSON object) | NEW - Runtime/sync metadata storage |

### Backward Compatibility

Old extensions can be migrated:
```typescript
// Old format
{
  key: "markket:odoo",
  key_sec: "api_key_here",
  data: { sync_products: true }
}

// New format
{
  key: "markket:odoo",
  credentials: { api_key: "api_key_here" },
  config: { sync_products: true },
  triggers: ["trigger:post_sale"] // Add appropriate triggers
}
```

---

## Security Considerations

1. **Credentials field** - While JSON, still needs encryption at rest
2. **Never log credentials** - Only log presence: `{ hasCredentials: !!ext.credentials }`
3. **Validate triggers** - Prevent arbitrary code execution
4. **Rate limiting** - Prevent infinite loops
5. **Async execution** - Don't block main operations
6. **Error boundaries** - Failed extensions shouldn't crash app

---

## Next Steps (Future PRs)

1. ✅ **This PR**: Schema design and data model
2. **Next PR**: Extension runner implementation
   - File resolver (`markket:odoo:newsletter` → file path)
   - Trigger matcher (event → extensions)
   - Execution engine (async, error handling, retry)
3. **Future PRs**:
   - Core extension implementations (Odoo, Stripe, Sendgrid, PostHog)
   - npm package support
   - External URL support
   - Admin UI for managing extensions

---

## Testing the Schema

After merging this PR, you can start adding extensions manually:

```typescript
// Add to a store
const store = await strapi.documents('api::store.store').findOne({ documentId });

await strapi.documents('api::store.store').update({
  documentId,
  data: {
    extensions: [
      {
        key: 'markket:odoo:newsletter',
        triggers: ['trigger:new_subscriber'],
        credentials: { api_key: '...' },
        config: { list_id: 5 },
        url: 'https://odoo.example.com/api',
        active: true
      }
    ]
  }
});
```

The schema is ready - implementation can follow incrementally!
