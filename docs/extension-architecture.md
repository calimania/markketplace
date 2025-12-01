# Extension System Architecture

Visual guide to the extension system design.

---

## Schema Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    common.extension                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  key: "namespace:class:method"                               │
│       └─ Maps to code location                               │
│                                                               │
│  triggers: ["trigger:event1", "trigger:event2"]              │
│       └─ Events that activate this extension                 │
│                                                               │
│  credentials: { api_key, client_id, ... }                    │
│       └─ Flexible auth data (JSON)                           │
│                                                               │
│  config: { setting1, setting2, ... }                         │
│       └─ Non-sensitive configuration (JSON)                  │
│                                                               │
│  url: "https://external-service.com/api"                     │
│       └─ External endpoint (optional)                        │
│                                                               │
│  active: true/false                                           │
│       └─ Enable/disable toggle                               │
│                                                               │
│  last_run: "2025-12-01T12:00:00Z"                            │
│       └─ Last execution timestamp                            │
│                                                               │
│  run_count: 42                                                │
│       └─ Total execution counter                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Key → Code Mapping

```
Extension Key Pattern:
┌──────────────┬───────────┬──────────┐
│  namespace   │   class   │  method  │
└──────────────┴───────────┴──────────┘
       ↓             ↓          ↓
    "markket"  :  "odoo"  : "newsletter"

Resolves to File:
src/extensions/markket/odoo/newsletter.ts
               └──────┘ └──┘ └────────┘
               namespace class method

If no method specified:
"markket:odoo" → src/extensions/markket/odoo/index.ts
```

---

## Event Flow

```
┌─────────────────────┐
│  Event Occurs       │
│  (e.g., new sale)   │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────────────────────────────────────┐
│  Extension Runner (Future PR)                       │
│  1. Detect event: "trigger:post_sale"               │
│  2. Find matching extensions in store.extensions    │
│  3. Filter by active=true and matching trigger      │
└──────────┬──────────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────────────────┐
│  For each matching extension:                        │
│                                                       │
│  Extension A: "markket:odoo:order"                   │
│  ├─ Parse key → markket/odoo/order.ts                │
│  ├─ Load handler                                     │
│  ├─ Execute with credentials + config                │
│  └─ Update last_run, increment run_count             │
│                                                       │
│  Extension B: "markket:sendgrid:order_confirm"       │
│  ├─ Parse key → markket/sendgrid/order_confirm.ts    │
│  ├─ Load handler                                     │
│  ├─ Execute with credentials + config                │
│  └─ Update last_run, increment run_count             │
│                                                       │
│  Extension C: "custom:webhook"                       │
│  ├─ Parse key → custom/webhook.ts                    │
│  ├─ Execute POST to extension.url                    │
│  └─ Update last_run, increment run_count             │
└───────────────────────────────────────────────────────┘
           │
           ↓
    [All async - don't block main flow]
```

---

## Content Type Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                      api::store.store                        │
│                                                               │
│  extensions: [                                                │
│    { key: "markket:odoo:newsletter", ... },                  │
│    { key: "markket:sendgrid:welcome", ... },                 │
│    { key: "custom:webhook", ... }                            │
│  ]                                                            │
│                                                               │
│  Triggers: new_subscriber, post_sale, order_fulfilled        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   api::product.product                       │
│                                                               │
│  extensions: [                                                │
│    { key: "markket:odoo:product", ... },                     │
│    { key: "markket:sendgrid:inventory_alert", ... }          │
│  ]                                                            │
│                                                               │
│  Triggers: product_updated, inventory_low, inventory_zero    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  common.prices (component)                   │
│                                                               │
│  extensions: [                                                │
│    { key: "markket:stripe:subscription", ... }               │
│  ]                                                            │
│                                                               │
│  Triggers: price_updated, stripe_subscription_created        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                api::subscriber.subscriber                    │
│                                                               │
│  extensions: [                                                │
│    { key: "markket:odoo:newsletter", ... }                   │
│  ]                                                            │
│                                                               │
│  Triggers: subscriber_verified, subscription_upgraded        │
└─────────────────────────────────────────────────────────────┘
```

---

## Multi-Extension Example

```
Store has multiple extensions for post-sale event:

┌──────────────────────────────────────────────────────┐
│ Event: trigger:post_sale                             │
└────────────────┬─────────────────────────────────────┘
                 │
       ┌─────────┴─────────┬─────────────┬──────────┐
       │                   │             │          │
       ↓                   ↓             ↓          ↓
┌─────────────┐   ┌────────────┐  ┌──────────┐  ┌──────────┐
│ Odoo Order  │   │ Email      │  │ PostHog  │  │ Webhook  │
│ Sync        │   │ Confirm    │  │ Track    │  │ Notify   │
│             │   │            │  │          │  │          │
│ markket:    │   │ markket:   │  │ posthog: │  │ custom:  │
│ odoo:       │   │ sendgrid:  │  │ track    │  │ webhook  │
│ order       │   │ order_     │  │          │  │          │
│             │   │ confirm    │  │          │  │          │
└─────────────┘   └────────────┘  └──────────┘  └──────────┘
      │                 │              │             │
      ↓                 ↓              ↓             ↓
  Creates           Sends          Tracks       POST to
  invoice          receipt        event        customer
  in Odoo          email          data         system
```

---

## Namespace Organization

```
src/extensions/
│
├── markket/              ← Core Markket extensions (in repo)
│   ├── odoo/
│   │   ├── index.ts      ← markket:odoo
│   │   ├── newsletter.ts ← markket:odoo:newsletter
│   │   ├── product.ts    ← markket:odoo:product
│   │   └── order.ts      ← markket:odoo:order
│   │
│   ├── stripe/
│   │   ├── subscription.ts ← markket:stripe:subscription
│   │   ├── invoice.ts      ← markket:stripe:invoice
│   │   └── webhook.ts      ← markket:stripe:webhook
│   │
│   └── sendgrid/
│       ├── welcome.ts      ← markket:sendgrid:welcome
│       ├── newsletter.ts   ← markket:sendgrid:newsletter
│       └── order_confirm.ts
│
├── posthog/              ← PostHog analytics (in repo)
│   ├── track.ts          ← posthog:track
│   ├── identify.ts       ← posthog:identify
│   └── feature_flag.ts
│
├── custom/               ← Generic handlers (in repo)
│   ├── webhook.ts        ← custom:webhook
│   └── webhook-authenticated.ts
│
└── customer/             ← Customer-specific extensions
    └── acme/
        └── erp.ts        ← customer:acme:erp
```

---

## Credentials Structure Examples

```javascript
// Simple API key
{
  "api_key": "sk_live_abc123"
}

// OAuth tokens
{
  "client_id": "abc123",
  "client_secret": "xyz789",
  "access_token": "token_here",
  "refresh_token": "refresh_here",
  "expires_at": "2025-12-31T23:59:59Z"
}

// Odoo multi-field
{
  "database": "production",
  "username": "integration_user",
  "api_key": "odoo_key_here",
  "url": "https://odoo.example.com"  // Can duplicate url field
}

// Stripe with mode
{
  "mode": "live",  // or "test"
  "live_key": "sk_live_...",
  "test_key": "sk_test_...",
  "webhook_secret": "whsec_..."
}

// Webhook with signature
{
  "secret": "webhook_secret_abc123",
  "algorithm": "sha256",
  "header_name": "X-Webhook-Signature"
}
```

---

## Trigger Matching Logic (Future)

```javascript
Extension Triggers:        Event Emitted:           Match?
["trigger:post_sale"]      "trigger:post_sale"      ✅ Exact match

["trigger:order_*"]        "trigger:order_created"  ✅ Wildcard match
                           "trigger:order_updated"  ✅ Wildcard match

["trigger:post_sale",      "trigger:post_sale"      ✅ In array
 "trigger:order_fulfilled"]

[]                         "trigger:post_sale"      ❌ Empty = manual only

["trigger:new_subscriber"] "trigger:post_sale"      ❌ No match
```

---

## Extension Handler Interface (Future)

```typescript
// src/extensions/markket/odoo/newsletter.ts

export default async function handler(context: ExtensionContext) {
  const {
    entity,      // The store, product, subscriber, etc.
    trigger,     // "trigger:new_subscriber"
    credentials, // { database, username, api_key }
    config,      // { list_id, auto_subscribe }
    url,         // "https://odoo.example.com/api"
    strapi       // Strapi instance
  } = context;

  // Your extension logic
  const response = await fetch(`${url}/mailing.contact`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: entity.Email,
      list_id: config.list_id,
      name: entity.name || 'Subscriber'
    })
  });

  if (!response.ok) {
    throw new Error(`Odoo API error: ${response.statusText}`);
  }

  return {
    success: true,
    message: 'Subscriber added to Odoo newsletter',
    data: await response.json()
  };
}
```

---

## Timeline

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Schema Design (THIS PR)                           │
│  ✅ Component schema defined                                │
│  ✅ Added to content types                                  │
│  ✅ Documentation complete                                  │
│  → Ready to merge                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Extension Runner (NEXT PR)                        │
│  ⏳ Key resolver implementation                             │
│  ⏳ Trigger matcher logic                                   │
│  ⏳ Execution engine                                        │
│  ⏳ Error handling & retry                                  │
│  ⏳ Middleware integration                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Core Extensions (INCREMENTAL)                     │
│  ⏳ markket:odoo:* implementations                          │
│  ⏳ markket:stripe:* implementations                        │
│  ⏳ markket:sendgrid:* implementations                      │
│  ⏳ posthog:* implementations                               │
│  ⏳ custom:webhook implementation                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Advanced Features (FUTURE)                        │
│  ⏳ npm package support                                     │
│  ⏳ External URL extensions                                 │
│  ⏳ Extension marketplace                                   │
│  ⏳ Admin UI enhancements                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

After merging this PR:

- [ ] Schema visible in Strapi admin
- [ ] Can add extension to Store via admin
- [ ] Can add extension to Product via admin
- [ ] Can add extension to Subscriber via admin
- [ ] Can add extension to Prices component via admin
- [ ] Extension data persists correctly
- [ ] `triggers` field accepts JSON array
- [ ] `credentials` field accepts JSON object
- [ ] `config` field accepts JSON object
- [ ] `active` toggle works
- [ ] `run_count` defaults to 0
- [ ] Can query extensions via API
- [ ] No errors in logs

---

This schema is production-ready and future-proof! 🚀
