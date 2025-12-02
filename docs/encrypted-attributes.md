# Adding Encrypted Fields

## Current Setup

Currently, **extension credentials** are auto-encrypted when you save them in the admin panel

**What this means today:**

- You can add extensions in Strapi admin
- Write plain text API keys, passwords, tokens
- They're automatically encrypted before saving to database
- You see encrypted values when viewing (can't reverse them)

## Adding More Encrypted Fields

Update the middleware config to add new fields

### Step 1: Identify What Needs Encryption

**Encrypt these:**

- API keys
- Passwords
- OAuth tokens
- Private keys
- Webhook secrets

**Don't encrypt these:**

- URLs
- Usernames
- IDs
- Public configuration
- Non-sensitive metadata

### Step 2: Update Middleware Config

Edit `src/middlewares/encrypt-extensions.ts`:

```typescript
const ENCRYPTED_FIELDS = {
  // Current - Extensions (all content types)
  '*': {
    'extensions': 'component'
  },

  // Add your new field here:
  'api::store.store': {
    'stripe_secret_key': 'direct',      // Single string field
    'payment_credentials': 'json'       // JSON object with api_key fields
  }
};
```

### Field Types Explained

**1. `'direct'` - Single String Field**

Use for: Single encrypted string values

```json
// Schema (schema.json)
{
  "stripe_secret_key": {
    "type": "string"
  }
}

// Admin writes:
"sk_live_abc123xyz456"

// Database stores:
"a1b2c3:d4e5f6g7h8..."  // ← Encrypted
```

**2. `'json'` - JSON Object Field**

Use for: JSON objects containing sensitive fields

```json
// Schema (schema.json)
{
  "payment_credentials": {
    "type": "json"
  }
}

// Admin writes:
{
  "stripe_publishable": "pk_live_...",  // Plain (searchable)
  "stripe_secret": "sk_live_..."         // Will be encrypted
}

// Database stores:
{
  "stripe_publishable": "pk_live_...",   // Plain
  "stripe_secret": "abc:def..."          // Encrypted
}
```

**3. `'component'` - Component Array** (Current usage)

Use for: Repeatable components with credentials

```json
// Schema (schema.json)
{
  "extensions": {
    "type": "component",
    "repeatable": true,
    "component": "common.extension"
  }
}

// Each extension's credentials field gets encrypted
```

### Step 3: Test It

1. **Restart Strapi** (middleware changes require restart)
2. **Go to admin panel**
3. **Create/edit entity with encrypted field**
4. **Write plain text value**
5. **Save**
6. **View again** - you should see encrypted value

### Step 4: Use in Code (Decrypt)

**In Strapi controllers/services:**
```typescript
import { decrypt, decryptCredentials } from '../services/encryption';

// Single field
const store = await strapi.documents('api::store.store').findOne({ documentId });
const secretKey = decrypt(store.stripe_secret_key);

// JSON field
const creds = decryptCredentials(store.payment_credentials);
console.log(creds.stripe_secret); // ← Plain text
```

**In markket-next handlers:**
```typescript
import { decrypt, decryptCredentials } from '@/lib/encryption';

const secretKey = decrypt(store.stripe_secret_key);
// Use secretKey for Stripe API calls
```

## Real-World Examples

### Example 1: Store Payment Settings

**Use case:** Each store has its own Stripe account

```typescript
// src/middlewares/encrypt-extensions.ts
const ENCRYPTED_FIELDS = {
  '*': { 'extensions': 'component' },
  'api::store.store': {
    'stripe_credentials': 'json'
  }
};

// schema.json
{
  "stripe_credentials": {
    "type": "json"
  }
}

// Admin writes:
{
  "publishable_key": "pk_live_...",  // Plain
  "secret_key": "sk_live_..."        // Gets encrypted
}
```

### Example 2: Webhook Secrets

**Use case:** Verify webhooks from external services

```typescript
// src/middlewares/encrypt-extensions.ts
const ENCRYPTED_FIELDS = {
  '*': { 'extensions': 'component' },
  'api::webhook.webhook': {
    'secret': 'direct'
  }
};

// schema.json
{
  "secret": {
    "type": "string"
  }
}

// Admin writes:
"whsec_abc123xyz456"

// Database stores:
"a1b2c3:d4e5f6..."  // Encrypted
```

### Example 3: OAuth Tokens

**Use case:** Store user OAuth tokens for integrations

```typescript
// src/middlewares/encrypt-extensions.ts
const ENCRYPTED_FIELDS = {
  '*': { 'extensions': 'component' },
  'plugin::users-permissions.user': {
    'oauth_tokens': 'json'
  }
};

// Admin writes:
{
  "provider": "google",          // Plain
  "access_token": "ya29.a0...",  // Gets encrypted
  "refresh_token": "1//0e..."    // Gets encrypted
}
```

## Migration Strategy

If you already have data and want to add encryption:

### Option 1: Fresh Start (Development)

Just add the field to config - new data will be encrypted

### Option 2: Migrate Existing Data (Production)

Create a migration script:

```typescript
// scripts/encrypt-existing-data.ts
import { encryptCredentials } from '../src/services/encryption';

async function migrate() {
  const stores = await strapi.documents('api::store.store').findMany({});

  for (const store of stores) {
    if (store.payment_credentials && !isEncrypted(store.payment_credentials.secret_key)) {
      await strapi.documents('api::store.store').update({
        documentId: store.documentId,
        data: {
          payment_credentials: encryptCredentials(store.payment_credentials)
        }
      });
      console.log(`Encrypted credentials for store ${store.title}`);
    }
  }
}

migrate();
```

## Current vs Future State

### Today (Current PR)
```typescript
const ENCRYPTED_FIELDS = {
  '*': { 'extensions': 'component' }  // ← Only extensions
};
```

**Encrypted:**
- Extension credentials (api_key, password, token fields)

**Use case:**
- Odoo integrations
- Sendgrid credentials
- PostHog keys
- Custom webhooks

### Later (When You Need It)

```typescript
const ENCRYPTED_FIELDS = {
  '*': { 'extensions': 'component' },
  'api::store.store': {
    'stripe_credentials': 'json',
    'payment_gateway_key': 'direct'
  },
  'api::integration.integration': {
    'api_key': 'direct',
    'oauth_tokens': 'json'
  }
};
```

**Encrypted:**
- Extension credentials
- Store payment credentials
- Integration API keys
- OAuth tokens
- Webhook secrets


### DON'T

1. **Don't encrypt everything** (kills searchability)
2. **Don't encrypt IDs or references** (need for lookups)
3. **Don't encrypt URLs** (need to query by service)
4. **Don't forget to restart Strapi** (middleware won't update)
5. **Don't commit encryption keys** (already gitignored)


**Future workflow (when users edit themselves):**

1. Same as above
2. Users can't see decrypted values (security!)
3. They can update by writing new plain text
4. Or leave encrypted values untouched
