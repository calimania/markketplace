## Features Board

This file is the execution board for Markketplace.

Use it for active work only:
- keep the current sprint tight and testable
- describe each active item with scope, dependencies, risk, compatibility impact, done criteria, and verification
- keep historical completed work in the archive section at the bottom

Do not add raw ideas directly here. Promote ideas into this board only when they are concrete enough to execute.

## Current Sprint

- [ ] Tienda protected store lifecycle
- [x] Rewrite features board
- [ ] Fetch images from pexels collection
- [ ] Fetch images from Getty collection
- [ ] Fetch data from posthog api, query by [domain, slug]

### 1. Tienda protected store lifecycle
Status: in progress

Scope:
- keep all new protected store routes under `/api/tienda/*`
- canonical routes are `/api/tienda/me`, `/api/tienda/stores`, `/api/tienda/stores/:ref`, `/api/tienda/stores/:ref/settings`
- keep `/api/tienda/tendero/:ref` as temporary compatibility alias

Dependencies:
- users-permissions JWT auth
- store ownership checks against `store.users` and `store.admin_users`
- authenticated role permissions enabled in Strapi admin

Risk:
- low to medium because these are additive routes, but role configuration can block testing

Compatibility impact:
- backward compatible because existing public and legacy routes are unchanged

Done criteria:
- authenticated user can read own actor profile
- authenticated user can list only owned stores
- authenticated user can create a store and becomes owner by default
- authenticated user can read and update owned store
- authenticated user can read and update owned store settings
- wrong-owner and unknown-resource private reads stay opaque

Verification:
- `GET /api/tienda/me` returns actor payload with JWT
- `GET /api/tienda/stores` returns only owned stores
- `POST /api/tienda/stores` creates a store and links current user
- `GET /api/tienda/stores/:ref` returns 404 for wrong owner and unknown ref with the same body
- `PUT /api/tienda/stores/:ref/settings` creates or updates settings

### 2. Rewrite features board
Status: in progress

Scope:
- convert this file from chronology into execution board
- preserve completed history in archive form

Dependencies:
- none

Risk:
- low

Compatibility impact:
- documentation only

Done criteria:
- top priorities are visible in under 60 seconds
- active work is separated from archive

Verification:
- file reads clearly top to bottom with active work first and archive last

## V0 Now: Security + Tienda Foundation

- [ ] Tienda resolver and ownership model
- [ ] Private endpoint error opacity
- [ ] Internal security alert rail
- [ ] Security and compliance schemas

### Tienda resolver and ownership model
Status: in progress

Scope:
- protect actor-scoped store reads with JWT + ownership checks
- keep one shared auth helper for store access

Dependencies:
- users-permissions JWT
- shared `api-auth` helper

Risk:
- medium if error handling leaks resource existence

Compatibility impact:
- additive only

Done criteria:
- store can be resolved by `documentId` or `slug`
- only store-linked actors can read private store payloads

Verification:
- missing JWT returns 401
- wrong owner and unknown store return the same opaque 404 response

### Private endpoint error opacity
Status: planned

Scope:
- generic messages for private endpoint failures
- internal logs keep the real cause

Dependencies:
- protected route handlers
- request correlation ids

Risk:
- low

Compatibility impact:
- may change private error bodies for new endpoints only

Done criteria:
- client never learns whether resource was absent or forbidden

Verification:
- compare wrong-owner and unknown-ref responses and confirm same status/body

### Internal security alert rail
Status: planned

Scope:
- send operational alert emails for probe spikes, private 5xx, and auth bursts
- use Strapi email plugin and SendGrid integration already present

Dependencies:
- `SECURITY_ALERT_EMAIL`
- dedupe window storage, ideally Valkey

Risk:
- medium if alerts spam

Compatibility impact:
- additive only

Done criteria:
- one real anomaly triggers one actionable email and suppresses duplicates for a short window

Verification:
- simulate repeated probing and confirm single alert with dedupe

### Security and compliance schemas
Status: planned

Scope:
- add `security-alert`, `content-report`, and optionally `compliance-action` content types
- schema only first, no APIs yet

Dependencies:
- Strapi content-type generation

Risk:
- low

Compatibility impact:
- additive only

Done criteria:
- admin can create and inspect records manually

Verification:
- Strapi boots and new content types appear in Content Manager

## V1 Launch Now

- [ ] Store owner default model
- [ ] Fewer canonical endpoints
- [ ] Workflow status model

### Store owner default model
Status: in progress

Scope:
- creator of a store is linked automatically to `store.users`
- role system remains the top-level route gate, ownership remains object-level gate

Dependencies:
- Tienda store create route

Risk:
- low

Compatibility impact:
- additive only

Done criteria:
- new stores are always owned by creator without manual repair

Verification:
- create store and confirm current user appears in relation

### Fewer canonical endpoints
Status: planned

Scope:
- keep one canonical private lifecycle for store and settings
- leave temporary aliases only where migration requires them

Dependencies:
- Next.js proxy wiring

Risk:
- medium if aliases linger too long and confuse clients

Compatibility impact:
- improves maintainability while keeping migration-safe aliases

Done criteria:
- clients can do the full store lifecycle through the Tienda namespace alone

Verification:
- Next.js proxy can wire all store admin flows without legacy write endpoints

### Workflow status model
Status: planned

Scope:
- add `workflow_status` to store and page separately from Strapi publish state

Dependencies:
- schema updates
- any dashboard/editor UI that reads business state

Risk:
- medium if mixed with existing `active` fields semantically

Compatibility impact:
- additive only, legacy `active` and `Active` stay untouched

Done criteria:
- business workflow and moderation workflow are distinct

Verification:
- schemas updated and existing clients unaffected

## V1.1 Revenue And Engagement

- [ ] Paid RSVP
- [ ] Recurring subscriptions
- [ ] Newsletter campaign sending

### Paid RSVP
Status: planned

Scope:
- add payment-aware RSVP lifecycle

Dependencies:
- Stripe checkout and order flow consistency

Risk:
- high because payments + event inventory are coupled

Compatibility impact:
- additive if isolated correctly

Done criteria:
- RSVP purchase flow works without weakening payment safety

Verification:
- checkout, success, webhook, and RSVP record reconcile cleanly

### Recurring subscriptions
Status: planned

Scope:
- recurring payments and billing lifecycle

Dependencies:
- Stripe subscription model and dashboard state

Risk:
- high

Compatibility impact:
- additive with new billing states

Done criteria:
- subscription signup, renewal, and failure states are modeled correctly

Verification:
- test subscription lifecycle end to end in Stripe test mode

### Newsletter campaign sending
Status: planned

Scope:
- move from subscriber sync to real campaign delivery orchestration

Dependencies:
- SendGrid config, newsletter content types, event webhooks

Risk:
- medium to high because deliverability and unsubscribe behavior matter

Compatibility impact:
- additive

Done criteria:
- campaign send lifecycle and reporting work without exposing sensitive config

Verification:
- draft, send, webhook ingest, and analytics update all succeed

## Ops And Reliability

- [ ] Public endpoint cache
- [ ] Valkey control plane
- [ ] 1k user burst readiness
- [ ] Secretless integration roadmap

### Public endpoint cache
Status: planned

Scope:
- cache only anonymous public GET endpoints
- bypass cache when JWT/auth context exists
- start with 10-30 second TTL

Dependencies:
- Next.js proxy cache layer
- optional Valkey backend

Risk:
- medium due to invalidation mistakes

Compatibility impact:
- no API contract change

Done criteria:
- hot public endpoints survive bursty refresh traffic without serving private data

Verification:
- cache hit/miss metrics exist and auth requests always bypass cache

### Valkey control plane
Status: planned

Scope:
- use Valkey first for rate counters, alert dedupe, and idempotency

Dependencies:
- Valkey connection config

Risk:
- low if used only as control plane initially

Compatibility impact:
- additive only

Done criteria:
- security and webhook workflows can rely on short-lived shared state

Verification:
- dedupe and idempotency scenarios behave correctly under repeated requests

### 1k user burst readiness
Status: planned

Scope:
- make burst traffic survivable rather than perfect

Dependencies:
- public cache
- rate limiting
- alerting

Risk:
- medium if tested too late

Compatibility impact:
- operational only

Done criteria:
- burst traffic does not take down API and graceful degradation works

Verification:
- load test public and private hot paths and inspect p95 latency, DB pressure, and alerting

### Secretless integration roadmap
Status: planned

Scope:
- move from raw env/provider keys toward `secret_ref` based integration config

Dependencies:
- meta schema evolution
- secret manager selection

Risk:
- medium because migration must preserve old stores

Compatibility impact:
- old encrypted credentials remain supported during migration

Done criteria:
- new integrations can resolve secrets by reference instead of raw env keys

Verification:
- resolver tries `secret_ref` first, then existing encrypted credentials, without leaking secrets

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
