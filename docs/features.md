# Features

## 2026

- [ ] tienda: changing slug affects links and emails, what do? (warn? backfill? redirect)
- [ ] tienda: Digital Ocean - AI endpoints suggest content
- [ ] config: clean up general config objects, urls, colors
- [ ] AI: open router decides which action is needed { key: action, } for api to proceed
- [ ] api: stripe, restrict redirect domains

## Aug 2026


- [ ] tienda: api: send posthog events to track milestone (users, content posted)
- [ ] tienda: read openSEO data
- [ ] tienda: inbox: order creates a thread with the buyer and seller
- [ ] stripe: staging uses test keys
- [ ] tienda: notify of shipment tracking change

- [ ] api: notify buyer of order change
- [x] storefront: Order,Purchase sends an email to slug@markket.place
- [ ] api: forward email to store owner / notify them, so they could reply directly from their inbox - iphone when ready

### v0.7.7
- [x] upgraded Strapi to 5.51.2
- [x] store Schema change

### v0.6.7
- [x] hotfix: documentId in inbox thread

### v0.6.66
- [x] stripe webhooks cleanup
- [x] bugfix: codemod in admin panel - updated latest strapi

### v0.5.0

- [x] Receive inbox by mail (slug@markket.place)
- [x] Read inbox in /tienda
- [x] Improve email templates
- [x] Improve standard content (example content, SEO backfill)
- [x] tienda: Open Router AI for backfilling seed data
- [x] api: stripe, sync Event PRICES
- [x] tienda: api: generate keywords with the AI endpoint
- [x] tienda: api: review saving PRICES for products & events
- [x] tienda: payouts: stripe dashboard connection: reconnect and verify account status sync in tienda
- [x] api: stripe, review connect integration
- [x] api: stripe, confirm store relation before connect
- [x] buyer receipt view remains public for checkout follow-up
- [x] tienda and crm content/actions remain authenticated and store-scoped
- [x] buyer can easy reply to order email to send inbox message reply-to slug@markket.place (domain)


### May 2026

- [x] Tienda protected store lifecycle
- [x] Rewrite features board
- [x] starter store seeding no longer auto-creates product/event placeholders
- [x] events accept client timezone and persist UTC safely
- [x] event schema includes `locations` and default timezone `America/New_York`
- [x] SEO autofill strips markdown/rich-text and generates keywords
- [x] `/api/tienda/me?includeContent=true` supports combined cross-store content feed
- [x] dashboard stats cache is persisted and warmed after store create
- [x] store create sends owner congrats email with first-store guidance
- [x] visibility response includes client summary JSON for fast UI decisions
- [x] api: ai: whatsapp bot conversation carries context


Routes:
- `GET /api/tienda/me?includeContent=true`:
	- returns `combinedContent` with cross-store items
	- supports `page`, `pageSize`, `search`, `types`
- `GET /api/stores/:id/visibility`:
	- now includes `summary` object
	- includes `enabled_sections`, `disabled_sections`, `explicit_overrides`, `content_signals`, `source`
- Event create/update via Tienda content endpoints:
	- send `timezone` as IANA id (example: `America/New_York`)
	- `startDate` and `endDate` accept ISO datetime or datetime-local strings
- RSVP sync endpoint:
	- response now includes `sendgridCredentialSource` and `sendgridListSource`
- Store settings and visibility toggles:
	- visibility booleans are stored in `settings.navigation` (`show_blog`, `show_shop`, `show_events`, `show_about`, `show_newsletter`, `show_home`)
	- fallback logic still applies when explicit booleans are not set
- Email templates:
	- subscriber welcome and store-owner congrats layouts were refreshed
	- dynamic values are HTML-escaped for safety
- Access policy:
	- buyer receipt view is intentionally public to reduce post-checkout friction
	- all tienda/crm content management and mutating actions require authenticated user context plus store access checks

### 3. Subscriber Public Endpoints handoff notes
Status: ready for frontend

Scope:
- document stable public contracts for subscribe and unsubscribe
- keep payload parsing compatibility so existing clients do not break
- provide copy-ready request and response examples for frontend teams

Dependencies:
- route config in src/api/subscriber/routes/subscriber-sync.ts
- controller parsing in src/api/subscriber/controllers/subscriber.ts
- service behavior in src/api/subscriber/services/subscriber.ts

Risk:
- low for new clients
- medium if frontend sends store id in a shape not covered by compatibility parsing

Compatibility impact:
- backward compatible
- existing POST /api/subscribers/subscribe behavior remains unchanged

Done criteria:
- frontend has one canonical request shape to implement
- alternate accepted request shapes are documented for migration safety
- expected success and validation error responses are documented

Verification:
- POST /api/subscribers/subscribe with email + storeDocumentId returns success true and sync_status pending
- POST /api/subscribers/unsubscribe with email + storeDocumentId returns success true with unsubscribed timestamp
- missing email or storeDocumentId returns 400 bad request

Frontend handoff contract:

Canonical request body for both endpoints:
- {"email":"person@example.com","storeDocumentId":"store_document_id_here"}

Also accepted for compatibility:
- {"Email":"person@example.com","store":"store_document_id_here"}
- {"email":"person@example.com","store":{"documentId":"store_document_id_here"}}
- {"email":"person@example.com","stores":["store_document_id_here"]}
- {"email":"person@example.com","stores":[{"documentId":"store_document_id_here"}]}

Endpoint: POST /api/subscribers/subscribe
- auth: false (public)
- success response shape:
	{"success":true,"message":"Subscriber saved and sync queued","data":{"subscriberDocumentId":"...","email":"person@example.com","storeDocumentId":"...","listDocumentId":"...","sync_status":"pending"}}

Endpoint: POST /api/subscribers/unsubscribe
- auth: false (public)
- success response shape:
	{"success":true,"message":"Unsubscribed successfully","data":{"email":"person@example.com","storeDocumentId":"...","unsubscribed_at":"ISO_DATE"}}
- if no existing subscriber is found, endpoint is still successful and returns:
	{"success":true,"message":"No subscription found","data":{"email":"person@example.com","storeDocumentId":"..."}}

Validation error shape:
- status 400
- message includes: email and storeDocumentId are required

Operational notes for frontend:
- treat subscribe as accepted/queued, not instant provider confirmation
- unsubscribe is immediate in Strapi records; provider removal is best effort and non-blocking
- prefer canonical body shape for all new clients

## V0 Now: Security + Tienda Foundation

- [x] Tienda resolver and ownership model
- [x] Private endpoint error opacity
- [ ] Internal security alert rail
- [ ] Security and compliance schemas


- [x] Store owner default model
- [x] Fewer canonical endpoints
- [x] Workflow status model


## V1.1 Revenue And Engagement

- [ ] Paid RSVP
- [ ] Recurring subscriptions
- [ ] Newsletter campaign sending

## Ops And Reliability

- [ ] Public endpoint cache
- [ ] Valkey control plane
- [ ] 1k user burst readiness
- [ ] Secretless integration roadmap

## Future

- webhook transaction complete finds store for default orders
- Astro static deployment with hydration cleanup
- read existing tags in posts and display in settings
- SocialPost content-type for scheduling/social feed
- Odoo API to manage marketing lists
- user email verification and account upgrade flows
- `POST /markket/sms` to send SMS or WhatsApp to a user
- content type Review for product reviews and article comments
- content type Appointment for digital product meetings
- customer or subscriber CRM model expansion
- SEO generate endpoint for product, page, article, and store
- save Inbox with associated order
- forward Inbox to Odoo with order or customer context
- forward order to Odoo for participating stores
- order tracking cleanup and title/schema revision
- Odoo webhook application
- product settings overriding store or env fees
- Stripe API usage for richer dashboard displays
- order-driven inventory reduction
- inventory and shipping options in extensions
- newsletter delivery content type via Strapi email
- URL resolver extension to update company contact in Odoo
- product quantity sales limits

## Completed Archive

### 2025

#### December
- [x] new common.schema extras for public optional content [products]
- [x] fix: stripe auditing in order.extra
- [x] Newsletter content-types
- [x] test odoo connection using instance.extensions.credentials
- [x] test sendgrid connection using instance.extensions.credentials
- [x] test odoo connection using store.extensions.credentials
- [x] create Extension schema
- [x] create store.extensions.notifications association

#### November
- [x] store.stats endpoints
- [x] store.settings.transaction_percentage
- [x] create stripe link use store.settings if present

#### October
- [x] verify stripe webhook before proceeding in checkout.complete

#### September
- [x] @strapi 5.24.2 upgrade
- [x] Read store.settings in public
- [x] STRIPE sync products|prices on save using middleware
- [x] Magic link via SMS, whatsapp & url shortner
- [x] Twilio incoming SMS webhook
- [x] URL Shortner content collection & controllers

#### August
- [x] POST markket/email
- [x] PUT store/settings
- [x] new design for homepage
- [x] album grid in homepage
- [x] new design for about us
- [x] new design for products
- [x] new design for product[slug]
- [x] new design for pages
- [x] new design for pages[slug]
- [x] new design for blog
- [x] new design for blog[slug]
- [x] write types to cafecito
- [x] Yo Publi.co - Gazeta
- [x] Quendom record and website https://github.com/dvidsilva/queendom
- [x] Tigerlily Website
- [x] NextJS client in DigitalOcean research
- [x] astro dynamic pages
- [x] login centralized to the API server
- [x] profile page for store fronts, posts, promotions, articles, events
- [x] strapi / astro sitemap review
- [x] start Next.js registration pages for store launch flows
- [x] create a Next.js content access library from scratch
- [x] use Astro API endpoints
- [x] Astro fix Meta.Title and SEO
- [x] product lists and pages from API
- [x] start working in Next.js dashboards
- [x] begin migration to Next.js and shared libraries after proving functionality
- [x] Strapi design system exploration
- [x] block `STRIPE_CUSTOMER_ID: null` from Store endpoint
- [x] bug: categories and users show up in selectors indiscriminately
- [x] fix middleware populate usage in Astro
- [x] use workspaces to publish types and utilities
- [x] Swagger UI
- [x] add Instagram API exploration
- [x] create content type Event, Calendar, and RSVP
- [x] customer resources can go on their own app
- [x] customers can input their own DigitalOcean keys

### 2024

#### November 4
- [x] additional markketplace deployment for dvidsilva

#### October 28
- [x] fix type definitions across the project
- [x] tags page
- [x] create content type Page separate from article semantics
- [x] add SendGrid API key to DigitalOcean before deploy
- [x] recreate MDX posts in admin
- [x] read homepage and about page from markket API
- [x] integrate content layer in markket.place Astro and remove duplicated posts
- [x] bug: category slug can repeat across stores
- [x] page slug does not need to be unique
- [x] read pages dynamically
- [x] read blogs dynamically
