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
