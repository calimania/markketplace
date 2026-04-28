# AI Agent Guide for Markketplace

Use this file as the default behavior guide for AI coding agents in this repository.

## Mission

Markketplace is a Strapi v5 CMS/API used by clients to run commerce and content workflows (products, newsletters, blogs, events, orders, forms, storefronts).

Priorities:
- Keep changes safe for client-facing APIs.
- Follow Strapi v5 patterns exactly.
- Prefer simple utilities and schema-driven logic over complex custom layers.
- Reuse built-in auth/permissions and existing service patterns before adding new abstractions.

## Fast Start

- Install/run (Node 24, npm 11+, Yarn 1): see [package.json](package.json)
- Dev server: `yarn dev`
- Build admin: `yarn build`
- Start production: `yarn start`
- Generate API docs: `yarn api:docs`
- Run API helper tests: `yarn api:test`

## Non-Negotiables

1. Schema first, always
- Check content-type schema before writing code: `src/api/*/content-types/*/schema.json`
- Field names are case-sensitive and not always conventional (`Name`, `SKU`, `PRICES`, etc.).
- Never guess model UID names; verify from schema.

2. Strapi v5 only
- Use Document Service API: `strapi.documents('api::x.y')`
- Do not introduce `strapi.entityService` (v4 pattern).
- Use document middleware (`strapi.documents.use`) instead of lifecycle files.
- Publish after update when content must be publicly visible.

3. Keep it simple and composable
- Put shared business logic in `src/services/*.ts` utilities.
- Keep controllers/routers thin; orchestrate from services.
- Prefer extending existing patterns over adding one-off frameworks.

4. Security and client safety
- Validate inputs before external calls or write operations.
- Never log secrets, tokens, raw credentials, or full sensitive payloads.
- Respect auth config on routes; if endpoint is client/public, explicitly verify `config.auth` and sanitization.

## Project Patterns

- Service layer examples: [src/services](src/services)
- Stripe implementation patterns: [src/services/stripe-sync.ts](src/services/stripe-sync.ts), [src/services/stripe-product.ts](src/services/stripe-product.ts), [src/services/stripe-price.ts](src/services/stripe-price.ts), [src/services/stripe-security.ts](src/services/stripe-security.ts)
- Document middleware patterns: [src/middlewares/price-inventory-changes.ts](src/middlewares/price-inventory-changes.ts), [src/middlewares/encrypt-extensions.ts](src/middlewares/encrypt-extensions.ts)
- API explorer routes: [src/api/store/routes/api-explorer.ts](src/api/store/routes/api-explorer.ts)
- Public explorer assets: [public/api-explorer.html](public/api-explorer.html), [public/api-explorer.js](public/api-explorer.js)

## Client-Facing API and Docs Map

Link to existing docs instead of duplicating details:
- Platform overview: [README.md](README.md)
- Strapi notes: [docs/strapi.md](docs/strapi.md)
- API explorers and endpoint references: [public/api-explorer.html](public/api-explorer.html), [docs/TIENDA_CONTENT_ENDPOINTS.md](docs/TIENDA_CONTENT_ENDPOINTS.md), [docs/BUYER_ENDPOINTS.md](docs/BUYER_ENDPOINTS.md), [docs/CRM_ENDPOINTS.md](docs/CRM_ENDPOINTS.md)
- Stripe integration: [docs/stripe.md](docs/stripe.md)
- Newsletter/SendGrid architecture: [docs/NEWSLETTER_SYSTEM.md](docs/NEWSLETTER_SYSTEM.md), [docs/email.md](docs/email.md)
- Extensions architecture: [docs/extensions.md](docs/extensions.md)
- Encryption details: [docs/encrypted-attributes.md](docs/encrypted-attributes.md)
- Deploy/runbook: [docs/deploy.md](docs/deploy.md), [docs/docker.md](docs/docker.md)

## Integrations (Stripe, SendGrid, Twilio)

- Stripe is a primary integration: follow existing service + middleware orchestration patterns in `src/services/stripe-*.ts`.
- SendGrid is used for email/newsletter flows; reuse existing newsletter and extension conventions before adding new send paths.
- Twilio support exists for SMS/webhook use cases; keep webhook auth/verification strict and avoid exposing unverified inbound traffic.

When changing integration code:
- Add validation and safe logging.
- Handle retries/fallbacks gracefully.
- Avoid blocking request lifecycle with long external calls.

## Route and Auth Guidance

- Start from existing route patterns in `src/api/*/routes`.
- Prefer built-in users-permissions behavior and existing auth middleware conventions.
- Do not make endpoints public (`auth: false`) unless explicitly required for storefront/client behavior.
- For owner/authenticated store workflows, prefer existing custom tienda/store flows rather than widening public core endpoints.

## PR-Ready Checklist for Agents

Before finalizing changes:
- Confirm schema field names and UID usage.
- Confirm Strapi v5 APIs only.
- Confirm published-state behavior if content is read by public endpoints.
- Confirm no secret leakage in logs or responses.
- Run relevant commands (`yarn build`, `yarn api:test`, or targeted checks) when feasible.
- Update or link docs if behavior changed for clients.

## What Not To Do

- Do not copy large blocks from docs into new instruction files.
- Do not create new architectural layers when existing services/utilities solve the task.
- Do not use deprecated v4 Strapi patterns.
- Do not assume field naming conventions.
