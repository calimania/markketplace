# Strapi Services

## Overview

Services in this directory provide business logic and external integrations for the Markketplace Strapi backend.

## Service Architecture

### Stripe Integration
- `stripe.ts` - Core Stripe client and utilities
- `stripe-product.ts` - Product-specific operations
- `stripe-price.ts` - Price management
- `stripe-sync.ts` - Orchestration layer for syncing
- `stripe-security.ts` - Validation and security configuration

### Extension System
- `encryption.ts` - AES-256-CBC encryption for extension credentials

## Encryption Service

**Purpose:** Secure storage of sensitive credentials in extension components.

### Quick Start

```typescript
import { encryptCredentials, decryptCredentials } from './encryption';

// Encrypt before saving to database
const encrypted = encryptCredentials({
  url: "https://api.odoo.com",
  username: "api_user",
  api_key: "plain_secret_key"  // This will be encrypted
});
// Result: { url: "...", username: "...", api_key: "iv:encrypted_data" }

// Decrypt when using credentials
const decrypted = decryptCredentials(encrypted);
// Result: { url: "...", username: "...", api_key: "plain_secret_key" }
```

### Auto-Encrypted Fields

The following field names are automatically encrypted/decrypted:
- `api_key`
- `password`
- `secret`
- `token`
- `access_token`
- `refresh_token`

All other fields remain plain text (searchable in database).

### Setup

1. Generate encryption key:
```bash
npm run build
node -e "require('./dist/services/encryption').generateKey()"
```

2. Add to `.env`:
```bash
ENCRYPTION_KEY=your_64_hex_char_key_here
```

3. Use in Strapi:
```typescript
// Before saving extension
const extension = {
  key: "markket:odoo:newsletter",
  credentials: encryptCredentials(rawCredentials),
  config: { mailing_list_id: 123 }
};

await strapi.documents('api::subscriber.subscriber').update({
  documentId,
  data: { extensions: [extension] }
});
```

4. Use in markket-next:
```typescript
// Copy encryption.ts to markket-next/lib/encryption.ts
import { decryptCredentials } from '@/lib/encryption';

const creds = decryptCredentials(extension.credentials);
// Use creds.api_key (now decrypted)
```

### Security Best Practices

**Encrypt:**
- ✅ API keys, passwords, tokens
- ✅ OAuth access/refresh tokens
- ✅ Private keys and secrets

**Keep Plain:**
- ❌ URLs (need to query by service)
- ❌ Usernames (searchable)
- ❌ Database names
- ❌ Configuration IDs
- ❌ External reference IDs

### Implementation Details

- **Algorithm:** AES-256-CBC
- **Key Size:** 32 bytes (256 bits)
- **IV:** Randomly generated per encryption (16 bytes)
- **Format:** `IV:encrypted_data` (both in hex)
- **Library:** Node.js `crypto` (built-in, no dependencies)

### Environment Variables

```bash
# Required for encryption/decryption
ENCRYPTION_KEY=64_hex_characters_here

# Must be same in both Strapi and markket-next
```

### Troubleshooting

**"ENCRYPTION_KEY environment variable not set"**
- Add `ENCRYPTION_KEY` to `.env` file

**"ENCRYPTION_KEY must be 64 hex characters"**
- Use `generateKey()` function to create valid key
- Key must be exactly 64 characters (32 bytes in hex)

**"Invalid encrypted format"**
- Encrypted values must be in `IV:data` format
- Check if value was encrypted with correct key
- Don't try to decrypt plain text

### Testing

```typescript
// Test encryption/decryption
import { encrypt, decrypt } from './encryption';

const original = "my_secret_key_123";
const encrypted = encrypt(original);
console.log('Encrypted:', encrypted); // "abc123:def456..."

const decrypted = decrypt(encrypted);
console.log('Decrypted:', decrypted); // "my_secret_key_123"
console.log('Match:', original === decrypted); // true
```

## Future Services

As the codebase grows, additional services will be added here:
- Email/notification services (if needed beyond Sendgrid plugin)
- Payment processing utilities
- Analytics integrations
- Custom business logic

## Service Layer Principles

1. **Single Responsibility** - One service, one purpose
2. **Pure Functions** - Predictable inputs/outputs where possible
3. **Error Handling** - Graceful degradation, never crash
4. **Security First** - Validate inputs, sanitize logs, encrypt secrets
5. **Documentation** - Clear JSDoc comments and examples
