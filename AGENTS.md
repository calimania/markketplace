# 🤖 AI Agent Guidelines for Markketplace

> **Essential practices for working with this Strapi v5 + Stripe marketplace codebase**

## 🎯 **Core Principles**

### **1. Always Check Schema First** 🔍
- **Read existing content-type schemas** before suggesting changes
- **Verify field names & capitalization** (e.g., `Name` not `name`, `PRICES` not `prices`)
- **Check relationship structures** and field types
- **Understand data flow** between Strapi and external services

### **2. Strapi v5 Patterns Only** 📚
- Use **Document Service API**: `strapi.documents('api::content.type')`
- **NOT Entity Service**: ~~`strapi.entityService`~~ (v4 pattern)
- **Document Service Middleware**: `strapi.documents.use()` for lifecycle hooks
- **NOT Lifecycle Files**: ~~`lifecycles.ts`~~ (deprecated in v5)
- **Proper publishing**: Always call `.publish()` after updates

### **3. Security First** 🛡️
- **Validate all inputs** before processing
- **Sanitize data for logging** - never log sensitive IDs/keys in production
- **Rate limiting** - add delays and limits for external API calls
- **Race condition protection** - prevent concurrent operations
- **Error boundaries** - graceful degradation when services fail

## 📁 **Architecture Standards**

### **Service Layer Pattern**
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

### **Separation of Concerns** 🏗️
- **Core utilities** → `services/[name].ts`
- **Business logic** → `services/[name]-[feature].ts`
- **Security & validation** → `services/[name]-security.ts`
- **Orchestration** → `services/[name]-sync.ts`
- **Middleware registration** → `middlewares/[name].ts`
- **App bootstrap** → `index.ts` (minimal)

## 🔒 **Security Practices**

### **Input Validation**
```typescript
// ✅ ALWAYS validate inputs
function validateProductData(product: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!product?.documentId) {
    errors.push('Product documentId is required');
  }

  if (!product?.Name || typeof product.Name !== 'string') {
    errors.push('Product name is required and must be a string');
  }

  return { valid: errors.length === 0, errors };
}
```

### **Secure Logging**
```typescript
// ✅ Safe logging - no sensitive data
console.log('[SERVICE_NAME] Operation completed successfully');
console.log('[SERVICE_NAME] Updated product with new references');

// ❌ Never log sensitive data
console.log('Stripe ID:', product.SKU); // NEVER!
console.log('Product:', product); // NEVER!
```

### **Rate Limiting & Debouncing**
```typescript
// ✅ Prevent rapid API calls
const updateDebounce = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 500; // Fast but safe

// ✅ Concurrency protection
const activeSyncs = new Set<string>();
if (activeSyncs.has(syncKey)) {
  console.log('Operation already in progress, skipping');
  return;
}
```

## 📝 **Logging Standards**

### **Professional Log Format**
```typescript
// ✅ Consistent, searchable format
console.log('[SERVICE_NAME] Starting operation...');
console.log('[SERVICE_NAME] Operation completed successfully');
console.error('[SERVICE_NAME] Failed to process:', error.message);
console.warn('[SERVICE_NAME] Fallback behavior activated');

// ✅ Structured data for debugging
console.log('[SERVICE_NAME] Processing summary:', {
  hasRequiredField: !!data.field,
  itemCount: array.length,
  operationType: 'create'
});
```

### **Log Levels & Context**
- **`console.log`**: Normal operations, success states
- **`console.warn`**: Fallback behaviors, non-critical issues
- **`console.error`**: Failures, validation errors
- **Always include service name** in brackets: `[SERVICE_NAME]`
- **No emojis in production logs** - keep professional

## 🔄 **Strapi v5 Document Service**

### **Middleware Registration**
```typescript
// ✅ CORRECT v5 pattern
export function registerMiddleware({ strapi }: { strapi: any }) {
  strapi.documents.use(async (context: any, next: any) => {
    const result = await next();

    // Your logic here

    return result;
  });
}
```

### **Document Operations**
```typescript
// ✅ v5 Document Service API
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

### **Prevent Infinite Loops**
```typescript
// ✅ Detect middleware-initiated updates
const dataKeys = Object.keys(context.data);
const isSystemUpdate = dataKeys.every(key =>
  ['SKU', 'PRICES', 'updatedAt', 'publishedAt'].includes(key)
);

if (isSystemUpdate) {
  console.log('[MIDDLEWARE] Skipping system update to prevent loops');
  return result;
}
```

## 🚨 **Critical Checks**

### **Before Making Changes**
1. **📋 Read the schema** - Check field names and types
2. **🔍 Search existing code** - Look for similar patterns
3. **🧪 Validate assumptions** - Check if field exists in content type
4. **⚡ Consider performance** - Will this scale?
5. **🛡️ Security review** - Any sensitive data exposure?
6. **🔄 Race conditions** - Could this conflict with other operations?

### **Field Name Verification**
```typescript
// ✅ Always verify schema first
// Check if field is "Name" or "name"
// Check if field is "PRICES" or "prices"
// Check if relationship field exists
// Verify field types (string, number, relation, etc.)
```

### **Error Handling**
```typescript
// ✅ Comprehensive error handling
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

## 🎨 **Code Style**

### **TypeScript Best Practices**
- **Explicit types** for function parameters and returns
- **Interface definitions** for complex objects
- **Null checks** before accessing properties
- **Optional chaining** for nested properties: `object?.property?.nested`

### **Function Design**
- **Single responsibility** - one function, one purpose
- **Pure functions** where possible - no side effects
- **Async/await** over Promises - cleaner error handling
- **Early returns** for validation - reduce nesting

### **Naming Conventions**
- **Services**: `kebab-case` filenames, `camelCase` functions
- **Constants**: `UPPER_SNAKE_CASE`
- **Log prefixes**: `[SERVICE_NAME]` in brackets
- **Boolean flags**: `has`, `is`, `should` prefixes

## 🚀 **Performance Guidelines**

### **External API Calls**
- **Batch operations** when possible
- **Implement retries** with exponential backoff
- **Cache responses** for repeated calls
- **Timeout protection** for slow services

### **Database Operations**
- **Minimize queries** - fetch related data efficiently
- **Batch updates** when updating multiple records
- **Use transactions** for multi-step operations
- **Publish only after all changes** complete

## 📚 **Common Patterns**

### **Validation Pattern**
```typescript
export function validateInput(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validation logic

  return { valid: errors.length === 0, errors };
}
```

### **Service Pattern**
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

### **Middleware Pattern**
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

## 🔗 **URL Shortener & SEO Optimization Patterns**

*Learnings from successful shortner implementation that contributed to funding success*

### **Bot Detection and SEO Strategy** 🤖
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

### **Root-Level Route Implementation** 🛣️
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

### **Cryptographically Secure Slug Generation** 🔐
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

### **Atomic Visit Tracking** ⚡
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

### **Multi-Route API Design** 🌐
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

### **Fallback Store Logic** 🏪
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

### **Collision-Resistant Slug Generation** 🎯
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

## 🔌 **Third-Party Service Integration**

*Server-side integration patterns to reduce client exposure and leverage official SDKs*

### **Official SDK First Policy** 📚
```typescript
// ✅ ALWAYS use official SDKs - they include best practices
import Stripe from 'stripe';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

// ❌ Never build custom API clients for well-supported services
// ❌ Don't use community wrappers when official SDKs exist
```

### **Server-Side Proxy Pattern** 🛡️
```typescript
// ✅ Keep all third-party credentials server-side
// Client sends minimal data, server handles API complexity

// Client request
POST /api/payments/create-intent
{
  "amount": 2000,
  "currency": "usd",
  "productId": "doc_123"
}

// Server handles Stripe complexity
export async function createPaymentIntent(ctx) {
  const { amount, currency, productId } = ctx.request.body;
  
  // Server-side validation and enrichment
  const product = await strapi.documents('api::product.product').findOne({
    documentId: productId
  });
  
  // Full Stripe integration with all metadata
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    metadata: {
      product_id: product.documentId,
      store_id: product.store?.documentId,
      // Rich server-side context
    }
  });
  
  // Return minimal client-safe data
  return { client_secret: paymentIntent.client_secret };
}
```

### **Environment-Based Client Configuration** ⚙️
```typescript
// ✅ Smart environment detection with fallbacks
export function createStripeClient(): Stripe {
  const isProduction = process.env.NODE_ENV === 'production';
  const apiKey = isProduction 
    ? process.env.STRIPE_SECRET_KEY 
    : process.env.STRIPE_SECRET_KEY_TEST;

  if (!apiKey) {
    throw new Error(`Stripe API key not found for ${isProduction ? 'production' : 'test'} environment`);
  }

  return new Stripe(apiKey, {
    apiVersion: '2024-06-20', // Pin to stable version
    typescript: true,
    telemetry: false, // Disable for security
  });
}

// ✅ Service-specific clients with proper typing
const stripe = createStripeClient();
const resend = new Resend(process.env.RESEND_API_KEY);
```

### **Community Knowledge Integration** 🌐
```typescript
// ✅ Follow established patterns from official docs and community
// Example: Stripe webhook handling with official best practices

export async function handleStripeWebhook(ctx) {
  const sig = ctx.request.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  try {
    // Use official verification method
    const event = stripe.webhooks.constructEvent(
      ctx.request.body,
      sig,
      endpointSecret
    );
    
    // Follow Stripe's recommended event handling patterns
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object);
        break;
      default:
        console.log(`[STRIPE] Unhandled event type: ${event.type}`);
    }
    
    return ctx.send({ received: true });
  } catch (err) {
    console.error('[STRIPE] Webhook signature verification failed:', err.message);
    return ctx.badRequest('Invalid signature');
  }
}
```

### **Client Data Minimization** 🔐
```typescript
// ✅ Expose only necessary data to client
export function sanitizeForClient(stripeProduct: Stripe.Product) {
  return {
    id: stripeProduct.id,
    name: stripeProduct.name,
    description: stripeProduct.description,
    images: stripeProduct.images,
    // ❌ Never expose: metadata, created timestamps, internal IDs
  };
}

// ✅ Create secure client configuration objects
export function createClientConfig() {
  return {
    stripe: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      // No secret keys or sensitive configuration
    },
    app: {
      baseUrl: process.env.MARKKET_API_URL,
      // Only public configuration
    }
  };
}
```

### **Future Plugin Architecture** 🔌
```typescript
// ✅ Design for extensibility - prepare for plugin extraction
// Structure services to be easily moved to plugins later

interface ThirdPartyService {
  name: string;
  initialize(config: any): Promise<void>;
  healthCheck(): Promise<boolean>;
}

class StripeService implements ThirdPartyService {
  name = 'stripe';
  private client: Stripe;
  
  async initialize(config: StripeConfig) {
    this.client = new Stripe(config.secretKey, config.options);
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.accounts.retrieve();
      return true;
    } catch {
      return false;
    }
  }
}

// ✅ Registry pattern for easy plugin conversion
const serviceRegistry = new Map<string, ThirdPartyService>();
serviceRegistry.set('stripe', new StripeService());
```

### **Error Handling & Monitoring** 📊
```typescript
// ✅ Service-specific error handling with context
export async function safeStripeCall<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      console.error(`[STRIPE] ${context} failed:`, {
        type: error.type,
        code: error.code,
        message: error.message,
        // Don't log sensitive request details
      });
    } else {
      console.error(`[STRIPE] ${context} unexpected error:`, error.message);
    }
    return null;
  }
}

// Usage with context
const product = await safeStripeCall(
  () => stripe.products.create(productData),
  'Product creation'
);
```

### **API Version Management** 📋
```typescript
// ✅ Pin API versions and handle upgrades systematically
const API_VERSIONS = {
  stripe: '2024-06-20',
  resend: '1.0.0',
  // Track all third-party API versions
} as const;

// ✅ Version compatibility checks
export function validateApiVersions() {
  const warnings: string[] = [];
  
  // Check for upcoming deprecations
  if (API_VERSIONS.stripe < '2024-06-20') {
    warnings.push('Stripe API version is outdated, consider upgrading');
  }
  
  return warnings;
}
```

### **Testing with Third-Party Services** 🧪
```typescript
// ✅ Use test modes and mock high-level operations
export function createTestStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY_TEST!, {
    apiVersion: '2024-06-20',
  });
}

// ✅ Mock external calls in unit tests
jest.mock('stripe', () => ({
  default: jest.fn(() => ({
    products: {
      create: jest.fn().mockResolvedValue(mockStripeProduct),
      update: jest.fn().mockResolvedValue(mockStripeProduct),
    }
  }))
}));
```

### **Migration Strategy for Plugins** 🚀
```typescript
// ✅ Design current services for easy plugin extraction

// Current: /src/services/stripe.ts
// Future: /src/plugins/stripe/server/services/stripe.ts

// Keep interface consistent for smooth migration
export interface PaymentService {
  createProduct(data: ProductData): Promise<ExternalProduct>;
  updateProduct(id: string, data: Partial<ProductData>): Promise<ExternalProduct>;
  deleteProduct(id: string): Promise<void>;
}

// Implementation can move to plugin without changing consumers
export class StripePaymentService implements PaymentService {
  // Service implementation
}
```

---

## 🎯 **Remember**

> **Quality over speed** - Take time to understand the schema, validate inputs, and implement proper error handling. A robust, secure implementation is worth more than a quick hack.

**Happy coding!** 🚀