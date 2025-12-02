# AI Agent Guidelines for Markketplace

Essential practices for working with this Strapi v5 + Stripe marketplace codebase.

## Core Principles

### 1. Always Check Schema First
- Read existing content-type schemas before suggesting changes
- Verify field names and capitalization (e.g., `Name` not `name`, `PRICES` not `prices`)
- Check relationship structures and field types
- Understand data flow between Strapi and external services

### 2. Strapi v5 Patterns Only
- Use Document Service API: `strapi.documents('api::content.type')`
- NOT Entity Service: `strapi.entityService` (v4 pattern)
- Document Service Middleware: `strapi.documents.use()` for lifecycle hooks
- NOT Lifecycle Files: `lifecycles.ts` (deprecated in v5)
- Proper publishing: Always call `.publish()` after updates

### 3. Security First
- Validate all inputs before processing
- Sanitize data for logging - never log sensitive IDs/keys in production
- Rate limiting - add delays and limits for external API calls
- Race condition protection - prevent concurrent operations
- Error boundaries - graceful degradation when services fail

## Architecture Standards

### Service Layer Pattern
```typescript
src/
├── services/              # Business logic & external integrations
│   ├── stripe.ts         # Core client & utilities
│   ├── stripe-product.ts # Product-specific operations
│   ├── stripe-price.ts   # Price management
│   ├── stripe-sync.ts    # Orchestration layer
│   └── stripe-security.ts # Validation & security
├── middlewares/          # Document Service middleware only
│   └── stripe-product-sync.ts
└── index.ts             # Clean registration only
```

### Separation of Concerns
- Core utilities → `services/[name].ts`
- Business logic → `services/[name]-[feature].ts`
- Security & validation → `services/[name]-security.ts`
- Orchestration → `services/[name]-sync.ts`
- Middleware registration → `middlewares/[name].ts`
- App bootstrap → `index.ts` (minimal)

## Security Practices

### Input Validation
```typescript
function validateProductData(product: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!product?.documentId) errors.push('Product documentId is required');
  if (!product?.Name || typeof product.Name !== 'string') {
    errors.push('Product name is required and must be a string');
  }
  return { valid: errors.length === 0, errors };
}
```

### Secure Logging
```typescript
// Safe logging - no sensitive data
console.log('[SERVICE_NAME] Operation completed successfully');
console.log('[SERVICE_NAME] Updated product with new references');

// Never log sensitive data
console.log('Stripe ID:', product.SKU); // NEVER
console.log('Product:', product); // NEVER
```

### Rate Limiting & Debouncing
```typescript
// Prevent rapid API calls
const updateDebounce = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 500; // Fast but safe

// Concurrency protection
const activeSyncs = new Set<string>();
if (activeSyncs.has(syncKey)) {
  console.log('Operation already in progress, skipping');
  return;
}
```

## Logging Standards

### Professional Log Format
```typescript
// Consistent, searchable format
console.log('[SERVICE_NAME] Starting operation...');
console.log('[SERVICE_NAME] Operation completed successfully');
console.error('[SERVICE_NAME] Failed to process:', error.message);
console.warn('[SERVICE_NAME] Fallback behavior activated');

// Structured data for debugging
console.log('[SERVICE_NAME] Processing summary:', {
  hasRequiredField: !!data.field,
  itemCount: array.length,
  operationType: 'create'
});
```

### Log Levels & Context
- **`console.log`**: Normal operations, success states
- **`console.warn`**: Fallback behaviors, non-critical issues
- **`console.error`**: Failures, validation errors
- Always include service name in brackets: `[SERVICE_NAME]`
- No emojis in production logs - keep professional

## Strapi v5 Document Service

### Middleware Registration
```typescript
// CORRECT v5 pattern
export function registerMiddleware({ strapi }: { strapi: any }) {
  strapi.documents.use(async (context: any, next: any) => {
    const result = await next();

    // Your logic here

    return result;
  });
}
```

### Document Operations
```typescript
// v5 Document Service API
const product = await strapi.documents('api::product.product').create({
  data: { Name: 'Product Name' }
});

const updated = await strapi.documents('api::product.product').update({
  documentId: product.documentId,
  data: { Name: 'New Name' }
});

// Always publish after updates
await strapi.documents('api::product.product').publish({
  documentId: product.documentId
});
```

### Prevent Infinite Loops
```typescript
// Detect middleware-initiated updates
const dataKeys = Object.keys(context.data);
const isSystemUpdate = dataKeys.every(key =>
  ['SKU', 'PRICES', 'updatedAt', 'publishedAt'].includes(key)
);

if (isSystemUpdate) {
  console.log('[MIDDLEWARE] Skipping system update to prevent loops');
  return result;
}
```

## Critical Checks

### Before Making Changes
1. Read the schema - Check field names and types
2. Search existing code - Look for similar patterns
3. Validate assumptions - Check if field exists in content type
4. Consider performance - Will this scale?
5. Security review - Any sensitive data exposure?
6. Race conditions - Could this conflict with other operations?

### Content Type Model Names (CRITICAL)
```typescript
// ACTUAL model names in this codebase - ALWAYS verify before using:
'api::article.article'  // NOT 'api::post.post'
'api::event.event'      // NOT 'api::events.events'
'api::page.page'        // Correct
'api::product.product'  // Correct
'api::category.category' // Correct
'api::order.order'      // Correct
'api::store.store'      // Correct

// DO NOT assume plural/singular - CHECK THE SCHEMA FILES:
// src/api/[name]/content-types/[name]/schema.json
```

### Field Name Verification
```typescript
// Always verify schema first
// Check if field is "Name" or "name"
// Check if field is "PRICES" or "prices"
// Check if relationship field exists
// Verify field types (string, number, relation, etc.)
```

### Error Handling
```typescript
// Comprehensive error handling
try {
  const result = await externalService.call();
  return result;
} catch (error) {
  console.error('[SERVICE] External service failed:', error.message);

  // Graceful degradation
  console.log('[SERVICE] Continuing with fallback behavior');
  return null;
}
```

## Code Style

### TypeScript Best Practices
- Explicit types for function parameters and returns
- Interface definitions for complex objects
- Null checks before accessing properties
- Optional chaining for nested properties: `object?.property?.nested`

### Function Design
- Single responsibility - one function, one purpose
- Pure functions where possible - no side effects
- Async/await over Promises - cleaner error handling
- Early returns for validation - reduce nesting

### Naming Conventions
- Services: `kebab-case` filenames, `camelCase` functions
- Constants: `UPPER_SNAKE_CASE`
- Log prefixes: `[SERVICE_NAME]` in brackets
- Boolean flags: `has`, `is`, `should` prefixes

## Performance Guidelines

### External API Calls
- Batch operations when possible
- Implement retries with exponential backoff
- Cache responses for repeated calls
- Timeout protection for slow services

### Database Operations
- Minimize queries - fetch related data efficiently
- Batch updates when updating multiple records
- Use transactions for multi-step operations
- Publish only after all changes complete

## Common Patterns

### Validation Pattern
```typescript
export function validateInput(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validation logic

  return { valid: errors.length === 0, errors };
}
```

### Service Pattern
```typescript
export async function performOperation(input: any): Promise<Result | null> {
  // 1. Validate input
  const validation = validateInput(input);
  if (!validation.valid) {
    console.error('[SERVICE] Validation failed:', validation.errors);
    return null;
  }

  // 2. Execute operation
  try {
    const result = await externalCall(input);
    console.log('[SERVICE] Operation completed successfully');
    return result;
  } catch (error) {
    console.error('[SERVICE] Operation failed:', error.message);
    return null;
  }
}
```

### Middleware Pattern
```typescript
export function registerMiddleware({ strapi }: { strapi: any }) {
  strapi.documents.use(async (context: any, next: any) => {
    // 1. Execute original operation
    const result = await next();

    // 2. Filter relevant operations
    if (context.uid !== 'api::target.content-type') {
      return result;
    }

    // 3. Async processing to avoid blocking
    setImmediate(async () => {
      try {
        await processResult(result, context);
      } catch (error) {
        console.error('[MIDDLEWARE] Processing failed:', error);
      }
    });

    return result;
  });
}
```

---

## URL Shortener & SEO Optimization Patterns

Learnings from successful shortner implementation that contributed to funding success

### Bot Detection and SEO Strategy
```typescript
// Professional bot detection for social media optimization
const BOT_USER_AGENTS = [
  'facebookexternalhit', 'Twitterbot', 'LinkedInBot', 'WhatsApp',
  'TelegramBot', 'Slackbot', 'SkypeUriPreview', 'GoogleBot',
  'ia_archiver', 'bingbot', 'Applebot', 'YandexBot'
];

function isBotRequest(userAgent: string): boolean {
  return BOT_USER_AGENTS.some(bot =>
    userAgent.toLowerCase().includes(bot.toLowerCase())
  );
}

// SEO-optimized HTML generation for social sharing
function generateSEOHTML(data: any): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="${data.title || 'Default Title'}" />
  <meta property="og:description" content="${data.description || 'Default Description'}" />
  <meta property="og:url" content="${data.url}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <title>${data.title || 'Default Title'}</title>
</head>
<body>
  <script>window.location.href = "${data.url}";</script>
  <p>Redirecting to <a href="${data.url}">${data.url}</a></p>
</body>
</html>`;
}
```

### Root-Level Route Implementation
```typescript
// Elegant root-level routing pattern for clean URLs
{
  method: 'GET',
  path: '/s/:slug',
  handler: 'shortner.redirect',
  config: {
    auth: false,
    policies: [],
    middlewares: [],
  },
}

// Middleware handling with dual response strategy
async function handleShortUrlRedirect(ctx, next) {
  const userAgent = ctx.request.headers['user-agent'] || '';

  if (isBotRequest(userAgent)) {
    // Return SEO-optimized HTML for crawlers
    ctx.type = 'text/html';
    ctx.body = generateSEOHTML(shortnerData);
  } else {
    // Fast redirect for human users
    ctx.redirect(shortnerData.url);
  }
}
```

### Cryptographically Secure Slug Generation
```typescript
// Production-grade slug generation with crypto security
import * as crypto from 'crypto';

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateCryptoRandomString(length: number): string {
  const bytes = crypto.randomBytes(length * 2);
  let result = '';

  for (let i = 0; i < bytes.length && result.length < length; i++) {
    const byte = bytes[i];
    if (byte < 248) { // Ensures uniform distribution
      result += BASE62_CHARS[byte % 62];
    }
  }

  return result.slice(0, length);
}

export function generateRandomSlug(): string {
  return generateCryptoRandomString(7); // ~3.5 trillion combinations
}

export function isValidSlug(slug: string): boolean {
  return /^[0-9a-zA-Z]{3,10}$/.test(slug);
}
```

### Atomic Visit Tracking
```typescript
// Race condition-safe visit counting
async function incrementVisitCount(documentId: string, currentCount: number) {
  try {
    await strapi.documents('api::shortner.shortner').update({
      documentId,
      data: { visit: currentCount + 1 }
    });
  } catch (error) {
    console.error('[SHORTNER] Visit count failed, using fallback');
    // Graceful degradation - continue redirect even if count fails
  }
}
```

### Multi-Route API Design
```typescript
// Professional API structure with multiple access patterns
const routes = [
  // Public short URL access (clean, memorable)
  { method: 'GET', path: '/s/:slug', handler: 'shortner.redirect', config: { auth: false } },

  // API access patterns for integrations
  { method: 'GET', path: '/shortners/:slug/redirect', handler: 'shortner.redirect', config: { auth: false } },
  { method: 'GET', path: '/shortners/:documentId/unfurl', handler: 'shortner.unfurl', config: { auth: false } },

  // User management and creation
  { method: 'POST', path: '/shortners/create', handler: 'shortner.create', config: { auth: false } },
  { method: 'GET', path: '/shortners/my', handler: 'shortner.findMine', config: {} },
];
```

### Fallback Store Logic
```typescript
// Professional store resolution with fallbacks
async function resolveStore(storeId?: string) {
  let store = null;

  if (storeId) {
    try {
      store = await strapi.documents('api::store.store').findOne({
        documentId: storeId
      });
    } catch (error) {
      console.warn(`[SHORTNER] Store ${storeId} not found, using default`);
    }
  }

  if (!store) {
    const DEFAULT_STORE_SLUG = process.env.MARKKET_STORE_SLUG || 'next';
    const stores = await strapi.documents('api::store.store').findMany({
      filters: { slug: DEFAULT_STORE_SLUG },
      limit: 1
    });
    store = stores && stores.length > 0 ? stores[0] : null;
  }

  return store;
}
```

### Collision-Resistant Slug Generation
```typescript
// Production-ready collision handling
async function generateUniqueSlug(customAlias?: string): Promise<string> {
  if (customAlias) {
    if (!isValidSlug(customAlias)) {
      throw new Error('Invalid alias format. Use 3-10 alphanumeric characters.');
    }

    const existing = await strapi.documents('api::shortner.shortner').findFirst({
      filters: { alias: customAlias }
    });

    if (existing) {
      throw new Error('Alias already exists');
    }

    return customAlias;
  }

  // Generate random slug with collision protection
  let attempts = 0;
  let slug = generateRandomSlug();

  while (attempts < 5) {
    const existing = await strapi.documents('api::shortner.shortner').findFirst({
      filters: { alias: slug }
    });

    if (!existing) break;

    slug = generateRandomSlug();
    attempts++;
  }

  if (attempts >= 5) {
    throw new Error('Failed to generate unique alias');
  }

  return slug;
}
```

---

## Stripe Webhook Integration

### Webhook Event Selection
```typescript
// Enable for complete payment tracking
charge.succeeded                 // Best source for balance_transaction fees
charge.captured                  // For authorized charges (manual capture)
checkout.session.completed       // Create/update order
payment_intent.succeeded         // Payment completed
charge.failed                    // Track payment failures
checkout.session.expired         // Abandoned carts
```

### Fee Retrieval Architecture
```typescript
// Multi-source fee retrieval with fallbacks

// 1. Primary: charge.succeeded webhook
if (charge?.balance_transaction) {
  const balanceTxn = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
}

// 2. Fallback: payment_intent.succeeded webhook
if (paymentIntent?.charges?.data?.length > 0) {
  const charge = paymentIntent.charges.data[0];
}

// 3. Deferred: Async retry after 2 seconds
setTimeout(() => {
  retrieveAndStoreActualFees(orderId, paymentIntent, isTest);
}, 2000);
```

### Webhook Handler Pattern
```typescript
async function handleWebhook(ctx) {
  const signature = ctx.request.headers['stripe-signature'];
  const is_test = body.data?.object?.id?.startsWith('cs_test_');
  const rawBody = ctx.request.body[Symbol.for('unparsedBody')];

  const event = verifyStripeWebhook(signature, rawBody?.toString(), is_test);
  if (!event) return ctx.badRequest('Invalid signature');

  const charge = event.data?.object;
  console.log('[STRIPE_WEBHOOK] Event processed', {
    eventType: event.type,
    resourceId: charge?.id?.substring(0, 10) + '...',
  });

  return ctx.send({ received: true });
}
```

### Fee Data Structure
```typescript
interface ActualStripeFees {
  fees_cents: number;
  fees_usd: string;
  net_cents: number;
  net_usd: string;
  amount_cents: number;
  amount_usd: string;
  source: string;
  retrieved_at: string;
  [key: string]: string | number;
}

order.extra = {
  stripe_actual_fees: actualStripeFees,
  fees_retrieval_status: 'success_from_charge_webhook'
};
```

---

## Extension System & Encryption Patterns

Production-ready extension system for flexible, secure integrations

### Core Principle: Strapi Stores, markket-next Executes

**Strapi responsibilities:**
- ✅ Store extension configurations (schema + data)
- ✅ Auto-encrypt sensitive credentials via middleware
- ✅ Provide extension data to markket-next
- ✅ Hide extensions from client API responses
- ❌ NO business logic - keep lean!

**markket-next responsibilities:**
- ✅ Implement extension handlers as Next.js API routes
- ✅ Decrypt credentials and execute integrations
- ✅ Return updated meta for Strapi to persist
- ✅ All business logic lives here

**Security: Extensions are admin-only**
```typescript
// Controllers sanitize extensions from client responses
export default factories.createCoreController('api::store.store', ({ strapi }) => ({
  async find(ctx) {
    const { data, meta } = await super.find(ctx);
    // Remove extensions from client API responses
    const sanitized = Array.isArray(data) ? data.map(item => {
      const { extensions, ...rest } = item;
      return rest;
    }) : data;
    return { data: sanitized, meta };
  },

  async findOne(ctx) {
    const { data, meta } = await super.findOne(ctx);
    if (data) {
      const { extensions, ...rest } = data;
      return { data: rest, meta };
    }
    return { data, meta };
  }
}));

// ✅ Admin panel: Full access to extensions (encrypted credentials visible)
// ✅ Client API: Extensions field stripped from responses
// ✅ markket-next: Receives full data from Strapi (decrypts as needed)
```

```typescript
// Strapi: Extension component (src/components/common/extension.json)
{
  "key": "markket:odoo:newsletter",           // Maps to handler file path
  "triggers": ["trigger:subscriber_create"],  // Event-based activation
  "credentials": {                            // Auto-encrypted by middleware
    "url": "https://api.odoo.com",           // Plain (searchable)
    "username": "api_user",                  // Plain (searchable)
    "api_key": "abc123:def456..."            // Encrypted! (AES-256-CBC)
  },
  "config": {                                // Plain settings (filterable)
    "mailing_list_id": 123,
    "tags": ["newsletter"]
  },
  "meta": {                                  // Runtime state (plain)
    "odoo_contact_id": 456,
    "last_sync_at": "2024-12-01T..."
  },
  "active": true,
  "last_run": "2024-12-01T...",
  "run_count": 42
}

// markket-next: Handler implementation
// /app/api/extensions/markket/odoo/newsletter/route.ts
import { decryptCredentials } from '@/lib/encryption';

export async function POST(request: Request) {
  const { entity, extension } = await request.json();

  // Decrypt credentials (same ENCRYPTION_KEY as Strapi)
  const creds = decryptCredentials(extension.credentials);

  // Execute integration with decrypted api_key
  const result = await syncToOdoo(entity, creds, extension.config);

  // Return updated meta for Strapi to save
  return Response.json({
    success: true,
    meta: {
      ...extension.meta,
      odoo_contact_id: result.id,
      last_sync_at: new Date().toISOString()
    }
  });
}
```

### Auto-Encryption Middleware Pattern

**Admin writes plain text, middleware auto-encrypts before database:**

```typescript
// src/middlewares/encrypt-extensions.ts
import { encryptCredentials } from '../services/encryption';

// Configure which fields to auto-encrypt per content type
const ENCRYPTED_FIELDS = {
  '*': { 'extensions': 'component' },  // All content types with extensions
  // Future: Add more fields as needed
  // 'api::store.store': { 'stripe_secret_key': 'direct' }
};

export function registerMiddleware({ strapi }: { strapi: any }) {
  strapi.documents.use(async (context: any, next: any) => {
    if (!['create', 'update'].includes(context.action)) {
      return next();
    }

    // Auto-encrypt extension credentials
    if (context.data?.extensions?.length > 0) {
      context.data.extensions = context.data.extensions.map((ext: any) => ({
        ...ext,
        credentials: encryptCredentials(ext.credentials)  // Auto-encrypt!
      }));
    }

    return next();
  });
}
```

**Admin experience:**
1. Admin types plain text: `"api_key": "secret123"`
2. Middleware encrypts: `"api_key": "abc123:def456..."`
3. Database stores encrypted value
4. Admin sees encrypted value when viewing (can't reverse)
5. Server decrypts only when needed

**Benefits:**
- ✅ Transparent to admins (just works)
- ✅ Prevents double-encryption (smart detection)
- ✅ Works for any JSON field (extensible)
- ✅ One middleware for all encrypted fields

### Encryption Service Implementation

```typescript
// src/services/encryption.ts
// Production-grade AES-256-CBC encryption using Node.js crypto

import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const SENSITIVE_FIELDS = ['api_key', 'password', 'secret', 'token', 'access_token', 'refresh_token'];

// Check if already encrypted (prevents double-encryption)
export function isEncrypted(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  if (parts.length !== 2) return false;
  const hexRegex = /^[0-9a-f]+$/i;
  return parts[0].length === 32 && hexRegex.test(parts[0]) && hexRegex.test(parts[1]);
}

export function encrypt(text: string): string {
  if (!text || isEncrypted(text)) return text;  // Skip if already encrypted

  const key = Buffer.from(process.env.MIDDLEWARE_ENCRYPTION_KEY, 'hex'); // 32 bytes
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`; // IV:data format
}

export function decrypt(text: string): string {
  const key = Buffer.from(process.env.MIDDLEWARE_ENCRYPTION_KEY, 'hex');
  const [ivHex, encryptedData] = text.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Auto-encrypt only sensitive fields in credentials object
export function encryptCredentials(credentials: any): any {
  if (!credentials || typeof credentials !== 'object') return credentials;

  const encrypted = { ...credentials };

  for (const field of SENSITIVE_FIELDS) {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      if (!isEncrypted(encrypted[field])) {
        encrypted[field] = encrypt(encrypted[field]);
      }
    }
  }

  return encrypted;
}

// Decrypt sensitive fields
export function decryptCredentials(credentials: any): any {
  if (!credentials || typeof credentials !== 'object') return credentials;

  const decrypted = { ...credentials };

  for (const field of SENSITIVE_FIELDS) {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      try {
        decrypted[field] = decrypt(decrypted[field]);
      } catch (error) {
        console.warn(`[ENCRYPTION] Failed to decrypt ${field}, keeping original`);
      }
    }
  }

  return decrypted;
}

// Generate encryption key: node -e "require('./dist/services/encryption').generateKey()"
export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 hex chars = 32 bytes
}

// Generate 32-byte (256-bit) key
export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 hex chars
}
```

### Default vs Custom Credential Pattern

```typescript
// Flexible credential resolution for multi-tenant scenarios

// Pattern 1: Use platform default (environment variables)
{
  "credentials": {
    "use_default": true
  }
}

// Handler resolves to env vars
const creds = extension.credentials.use_default ? {
  url: process.env.ODOO_DEFAULT_URL,
  api_key: process.env.ODOO_DEFAULT_API_KEY
} : decryptCredentials(extension.credentials);

// Pattern 2: Customer-specific (encrypted in database)
{
  "credentials": {
    "use_default": false,
    "url": "https://customer.odoo.com",
    "database": "customer_db",
    "api_key": "encrypted:abc123..."  // Encrypted
  }
}

// Use case: HIPAA compliance, customer isolation, multi-region
```

### Extension Execution Flow & Resolution

**Smart resolution: Extensions already loaded with entity**

```typescript
// PERFORMANCE TIP: Always populate store when creating/updating entities
// This loads extensions without extra queries!

const subscriber = await strapi.documents('api::subscriber.subscriber').create({
  data: { email, name },
  populate: ['store', 'store.extensions']  // ✅ Load store + extensions in one query
});

// Now subscriber.store.extensions is already available - no extra query!
```

**Extension sources (priority order):**
1. Entity's own extensions (e.g., `subscriber.extensions`)
2. Parent store's extensions (already loaded via populate)
3. Instance-level store extensions (cached default store)

**Optimized trigger detection → Extension resolution → Execution:**

```typescript
// 1. Strapi: Detect trigger event and resolve extensions (NO extra queries)
strapi.documents.use(async (context, next) => {
  const result = await next();

  if (context.action === 'create' && context.uid === 'api::subscriber.subscriber') {
    // Check entity extensions first (already in result)
    let extensions = result.extensions?.filter(ext =>
      ext.active && ext.triggers?.includes('trigger:subscriber_create')
    );

    // Fallback to store extensions (already populated if you followed best practice)
    if (!extensions?.length && result.store?.extensions) {
      extensions = result.store.extensions.filter(ext =>
        ext.active && ext.triggers?.includes('trigger:subscriber_create')
      );
    }

    // Last fallback: Use cached default store (load once at startup)
    if (!extensions?.length) {
      const defaultExtensions = getDefaultStoreExtensions();  // Cached in memory
      extensions = defaultExtensions?.filter(ext =>
        ext.active && ext.triggers?.includes('trigger:subscriber_create')
      );
    }

    if (!extensions?.length) return result;

    // 2. Execute extensions (async, non-blocking)
    setImmediate(async () => {
      for (const ext of extensions) {
        try {
          await executeExtension(ext, result, context);
        } catch (error) {
          console.error(`[EXTENSION] Failed to execute ${ext.key}:`, error);
        }
      }
    });
  }

  return result;
});
```

**Best Practice: Load extensions proactively**
```typescript
// ❌ BAD: Requires extra query in middleware
const subscriber = await strapi.documents('api::subscriber.subscriber').create({
  data: { email, name, store: storeId }
  // Missing populate - middleware will query store later
});

// ✅ GOOD: Extensions already loaded
const subscriber = await strapi.documents('api::subscriber.subscriber').create({
  data: { email, name, store: storeId },
  populate: ['store', 'store.extensions']  // One query gets everything
});

// ✅ BEST: Cache default store extensions at startup
let defaultStoreExtensions = null;

export async function getDefaultStoreExtensions() {
  if (!defaultStoreExtensions) {
    const defaultStore = await strapi.documents('api::store.store').findFirst({
      filters: { slug: process.env.MARKKET_STORE_SLUG || 'next' },
      populate: ['extensions']
    });
    defaultStoreExtensions = defaultStore?.extensions || [];
  }
  return defaultStoreExtensions;
}
```

**Performance comparison:**
```typescript
// ❌ SLOW: 3 database queries
// 1. Create subscriber
// 2. Query store for extensions (middleware)
// 3. Query default store if needed
Total: ~30-50ms database time

// ✅ FAST: 1 database query + memory lookup
// 1. Create subscriber with populate
// 2. Check result.store.extensions (already loaded)
// 3. Check cached default extensions (memory)
Total: ~10-15ms database time

// Performance gain: 2-3x faster, scales better under load
```

### Complete Extension Execution Flow (Decrypt → POST → Callback)

**Full flow from trigger to callback:**

```typescript
// 1. STRAPI MIDDLEWARE: Detect trigger, decrypt credentials, POST to markket-next
import { decryptCredentials } from '../services/encryption';

strapi.documents.use(async (context, next) => {
  const result = await next();

  if (context.action === 'create' && context.uid === 'api::subscriber.subscriber') {
    // Get extensions (already loaded if populated)
    let extensions = result.extensions?.filter(ext =>
      ext.active && ext.triggers?.includes('trigger:subscriber_create')
    );

    // Fallback to store extensions (already loaded)
    if (!extensions?.length && result.store?.extensions) {
      extensions = result.store.extensions.filter(ext =>
        ext.active && ext.triggers?.includes('trigger:subscriber_create')
      );
    }

    if (!extensions?.length) return result;

    // Execute extensions async (non-blocking)
    setImmediate(async () => {
      for (const ext of extensions) {
        try {
          // Decrypt credentials in Strapi context (has ENCRYPTION_KEY)
          const decryptedCreds = decryptCredentials(ext.credentials);

          // POST to markket-next handler
          const response = await fetch(`${process.env.MARKKET_NEXT_URL}/api/extensions/${ext.key.replace(/:/g, '/')}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity: {
                documentId: result.documentId,
                email: result.Email,
                name: result.name,
                store: result.store?.slug
              },
              extension: {
                key: ext.key,
                config: ext.config,
                meta: ext.meta
              },
              credentials: decryptedCreds,  // Decrypted credentials sent to markket-next
              trigger: 'trigger:subscriber_create'
            })
          });

          const handlerResult = await response.json();

          // 3. CALLBACK: Save returned meta back to extension
          if (handlerResult.success && handlerResult.meta) {
            await updateExtensionMeta(result.documentId, ext.key, handlerResult.meta);
          }

        } catch (error) {
          console.error(`[EXTENSION] Failed to execute ${ext.key}:`, error);
        }
      }
    });
  }

  return result;
});

// 2. MARKKET-NEXT HANDLER: Receive decrypted creds, call Odoo, return meta
// /app/api/extensions/markket/odoo/newsletter/route.ts

export async function POST(request: Request) {
  const { entity, extension, credentials, trigger } = await request.json();

  // Credentials already decrypted by Strapi!
  // Format payload for Odoo
  const odooPayload = {
    email: entity.email,
    name: entity.name,
    mailing_list_id: extension.config.mailing_list_id,
    tags: extension.config.tags || []
  };

  // Call Odoo API with decrypted credentials
  const odooResponse = await fetch(`${credentials.url}/api/v2/mailing.contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Odoo-Database': credentials.database,
      'Authorization': `Bearer ${credentials.api_key}`  // Decrypted!
    },
    body: JSON.stringify(odooPayload)
  });

  const odooResult = await odooResponse.json();

  // Return meta for Strapi to save in extension
  return Response.json({
    success: true,
    meta: {
      odoo_contact_id: odooResult.id,           // Foreign key to find this contact
      company_id: odooResult.company_id,        // Additional context
      mailing_list_ids: odooResult.list_ids,    // Which lists they're in
      synced_at: new Date().toISOString(),      // Last sync timestamp
      sync_status: 'completed'                  // Status tracking
    }
  });
}

// 4. STRAPI CALLBACK: Update subscriber.extensions with returned meta
async function updateExtensionMeta(
  entityId: string,
  extensionKey: string,
  updatedMeta: any
) {
  const entity = await strapi.documents('api::subscriber.subscriber').findOne({
    documentId: entityId
  });

  // Update the specific extension's meta
  const updatedExtensions = entity.extensions.map(ext =>
    ext.key === extensionKey
      ? {
          ...ext,
          meta: { ...ext.meta, ...updatedMeta },        // Merge new meta
          last_run: new Date().toISOString(),           // Track execution
          run_count: (ext.run_count || 0) + 1           // Increment counter
        }
      : ext
  );

  // Save back to subscriber
  await strapi.documents('api::subscriber.subscriber').update({
    documentId: entityId,
    data: { extensions: updatedExtensions }
  });

  console.log('[EXTENSION] Meta updated', {
    entityId: entityId.substring(0, 10) + '...',
    extensionKey,
    newMeta: Object.keys(updatedMeta)
  });
}
```

**Pattern 2: URL-based webhook (external endpoint)**
```typescript
// Extension sends POST to external URL
{
  "key": "webhook:external:crm",
  "triggers": ["trigger:subscriber_create"],
  "url": "https://customer-crm.com/webhooks/markket",
  "credentials": { "api_key": "encrypted..." },
  "config": { "event_type": "new_subscriber" }
}

// markket-next: Generic webhook handler
export async function POST(request: Request) {
  const { entity, extension } = await request.json();
  const creds = decryptCredentials(extension.credentials);

  // Standard webhook payload
  const payload = {
    key: extension.key,
    event: extension.triggers[0],
    entity_type: 'subscriber',
    entity: {
      email: entity.email,
      name: entity.name,
      store: entity.store?.slug
    },
    config: extension.config,
    timestamp: new Date().toISOString()
  };

  // POST to external URL
  const response = await fetch(extension.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': creds.api_key,
      'X-Markket-Signature': generateSignature(payload, creds.api_key)
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  // Save any returned metadata
  return Response.json({
    success: response.ok,
    meta: {
      external_id: result.id,
      external_status: result.status,
      last_webhook_at: new Date().toISOString(),
      response_code: response.status
    }
  });
}
```

**Pattern 3: Hybrid (code + callback)**
```typescript
// Extension processes then calls back with results
{
  "key": "markket:sendgrid:sync",
  "triggers": ["trigger:subscriber_create"],
  "url": "https://api.markketplace.com/callbacks/extensions",  // Callback URL
  "credentials": { "sendgrid_api_key": "encrypted..." }
}

// Handler processes async, calls back when done
async function processExtension(entity, extension) {
  const result = await longRunningSync(entity, extension);

  // POST results back to callback URL
  await fetch(extension.url, {
    method: 'POST',
    body: JSON.stringify({
      extension_id: extension.id,
      entity_id: entity.documentId,
      meta: {
        sendgrid_contact_id: result.id,
        list_ids: result.lists
      }
    })
  });
}
```

### Standard Payload Structure

**Consistent payload across all extension types:**

```typescript
interface ExtensionPayload {
  key: string;                    // Extension key
  event: string;                  // Trigger that fired
  entity_type: string;            // 'subscriber', 'order', 'product', etc.
  entity: Record<string, any>;    // Full entity data (sanitized)
  store?: {                       // Parent store context
    slug: string;
    name: string;
    documentId: string;
  };
  credentials?: Record<string, any>;  // Decrypted (handlers only)
  config: Record<string, any>;        // Extension config
  meta?: Record<string, any>;         // Current meta state
  timestamp: string;                  // ISO 8601
}

// Example: New subscriber
{
  "key": "markket:odoo:newsletter",
  "event": "trigger:subscriber_create",
  "entity_type": "subscriber",
  "entity": {
    "documentId": "abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "tags": ["newsletter"]
  },
  "store": {
    "slug": "acme-store",
    "name": "ACME Store",
    "documentId": "store123"
  },
  "credentials": {
    "url": "https://acme.odoo.com",
    "database": "acme_prod",
    "api_key": "decrypted_key_here"  // Only in handler execution
  },
  "config": {
    "mailing_list_id": 42,
    "auto_subscribe": true
  },
  "meta": {
    "odoo_contact_id": null  // Will be populated on success
  },
  "timestamp": "2024-12-01T10:30:00Z"
}
```

### Callback & Meta Update Pattern

**Extensions return metadata to persist state:**

```typescript
// Handler returns updated meta
return Response.json({
  success: true,
  meta: {
    odoo_contact_id: 12345,
    company_id: 67890,
    mailing_list_ids: [42, 43],
    synced_at: "2024-12-01T10:30:15Z",
    sync_status: "completed"
  }
});

// Strapi saves meta back to extension
async function updateExtensionMeta(
  entityId: string,
  extensionKey: string,
  updatedMeta: any
) {
  const entity = await strapi.documents('api::subscriber.subscriber').findOne({
    documentId: entityId
  });

  const updatedExtensions = entity.extensions.map(ext =>
    ext.key === extensionKey
      ? {
          ...ext,
          meta: { ...ext.meta, ...updatedMeta },
          last_run: new Date().toISOString(),
          run_count: (ext.run_count || 0) + 1
        }
      : ext
  );

  await strapi.documents('api::subscriber.subscriber').update({
    documentId: entityId,
    data: { extensions: updatedExtensions }
  });
}
```

### Extension Key Mapping Pattern

```typescript
// Triple-segment keys map to file paths

// Extension key
"markket:odoo:newsletter"

// Maps to handler file
markket-next/app/api/extensions/markket/odoo/newsletter/route.ts

// Maps to service file
markket-next/extensions/markket/odoo/newsletter.ts

// Pattern enables:
// - Organized codebase (namespace/service/method)
// - Easy discovery (key tells you where code lives)
// - Flexible deployment (can route to different apps by namespace)
```

### Extensibility & Multi-Tenancy Benefits

**The extension system is designed for infinite extensibility:**

1. **Community Extensions** - Anyone can create handlers
   - Third-party developers add handlers for their services
   - Share extension configs via JSON (credentials excluded)
   - Namespace isolation prevents conflicts (`acme:crm:sync` vs `zap:crm:sync`)

2. **Multi-Company Operations** - Credentials per store/entity
   - Each store can have different Odoo instances
   - Entity-level overrides for special cases
   - Default credentials for platform-wide services

3. **Flexible Workflows** - Mix triggers and operations
   - `trigger:subscriber_create` → Sync to CRM + Add to mailing list + Track in analytics
   - `trigger:order_complete` → Update inventory + Send invoice + Notify warehouse
   - `trigger:product_update` → Sync to Shopify + Clear cache + Reindex search

4. **Incremental Adoption** - Start simple, add complexity
   - Start: Simple webhook to Zapier
   - Evolve: Direct API integration with custom logic
   - Scale: Multi-service orchestration with dependencies

**Example: Multi-company Odoo integration**
```typescript
// Store A: Uses own Odoo instance
{
  "key": "markket:odoo:newsletter",
  "credentials": {
    "url": "https://storea.odoo.com",
    "database": "storea_prod",
    "api_key": "encrypted..."  // Store A's key
  }
}

// Store B: Uses own Odoo instance
{
  "key": "markket:odoo:newsletter",
  "credentials": {
    "url": "https://storeb.odoo.com",
    "database": "storeb_prod",
    "api_key": "encrypted..."  // Store B's key
  }
}

// Store C: Uses platform default
{
  "key": "markket:odoo:newsletter",
  "credentials": {
    "use_default": true  // Resolves to env vars
  }
}

// Same handler code, different credentials = Multi-tenant ready!
```

**Example: Community-contributed extension**
```typescript
// Developer creates handler for PostHog analytics
// markket-next/app/api/extensions/community/posthog/track/route.ts

export async function POST(request: Request) {
  const { entity, extension } = await request.json();
  const creds = decryptCredentials(extension.credentials);

  await fetch('https://app.posthog.com/capture', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${creds.api_key}` },
    body: JSON.stringify({
      event: 'new_subscriber',
      distinct_id: entity.email,
      properties: {
        store: entity.store?.slug,
        source: extension.config.source || 'website'
      }
    })
  });

  return Response.json({ success: true });
}

// Users add via admin panel:
{
  "key": "community:posthog:track",
  "triggers": ["trigger:subscriber_create"],
  "credentials": { "api_key": "their_posthog_key" },
  "config": { "source": "landing_page" },
  "active": true
}
```
