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
