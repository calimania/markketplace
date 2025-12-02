# Markkët Extensions

## Overview

Extensions in Markketplace provide a flexible integration system:

1. **Extension Component** - Reusable data storage for integration configs (credentials, settings, metadata)
2. **Extension Handlers** - Implementation logic in `markket-next` Next.js app (keeps Strapi lean)
3. **Encryption Service** - Secure credential storage using AES-256-CBC

**Architecture Pattern:**
- **Strapi** - Stores extension configurations (schema only, no business logic)
- **markket-next** - Implements extension handlers as Next.js API routes
- Extensions can push to external services (Odoo, Sendgrid) or respond to webhooks

---

## Extension Component System (NEW)

The `common.extension` component provides a flexible, reusable way to attach integration configurations to any content type in Strapi v5.

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
