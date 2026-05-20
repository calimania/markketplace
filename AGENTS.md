# Markketplace AI Agent Guide (Compact)

This file is intentionally short to keep agent context focused.

## Core Rules

1. Use Strapi v5 patterns only.
- Use `strapi.documents('api::x.y')`.
- Do not use `strapi.entityService`.
- Prefer document middleware (`strapi.documents.use`) over lifecycle files.

2. Schema first.
- Verify every content type in `src/api/*/content-types/*/schema.json` before coding.
- Never guess field names or model UIDs.

3. Keep APIs safe.
- Validate inputs before writes or external calls.
- Keep route auth strict; do not set `auth: false` unless explicitly required.
- Never log secrets, tokens, or raw sensitive payloads.

4. Keep implementation simple.
- Put shared logic in `src/services/*.ts`.
- Keep controllers/routers thin.
- Extend existing patterns before adding abstractions.

## Quick Commands

- Dev: `yarn dev`
- Build: `yarn build`
- Start: `yarn start`
- Docs: `yarn api:docs`
- API helper tests: `yarn api:test`

Runtime baseline: Node 24.x, npm 11+, Yarn 1 (see `package.json`).

## Integration Notes

- Stripe: follow `src/services/stripe-*.ts` patterns.
- SendGrid: reuse existing newsletter/template flows before adding new paths.
- Twilio/webhooks: enforce strict verification.

## Client-Facing Behavior Checklist

Before merging:
- Confirm schema names and UID usage.
- Confirm public-read content is published when required.
- Confirm no secret leakage in logs/responses.
- Run relevant checks (`yarn build`, `yarn api:test`, or targeted tests).
- Update docs only when behavior changes.

## Reference Docs

- Platform overview: [README.md](README.md)
- Strapi notes: [docs/strapi.md](docs/strapi.md)
- Tienda content endpoints: [docs/TIENDA_CONTENT_ENDPOINTS.md](docs/TIENDA_CONTENT_ENDPOINTS.md)
- CRM endpoints: [docs/CRM_ENDPOINTS.md](docs/CRM_ENDPOINTS.md)
- Stripe: [docs/stripe.md](docs/stripe.md)
- Email/newsletter: [docs/email.md](docs/email.md), [docs/NEWSLETTER_SYSTEM.md](docs/NEWSLETTER_SYSTEM.md)
- Extensions/encryption: [docs/extensions.md](docs/extensions.md), [docs/encrypted-attributes.md](docs/encrypted-attributes.md)
- Deploy/docker: [docs/deploy.md](docs/deploy.md), [docs/docker.md](docs/docker.md)
