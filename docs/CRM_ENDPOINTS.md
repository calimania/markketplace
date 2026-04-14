# CRM Endpoints (Phase 2 Skeleton)

Separate CRM namespace to keep tienda focused on content management.

Base URL:
- `/api/crm`

Auth:
- JWT required on all routes
- `storeRef` query is required for store-scoped access control
- Access check reuses shared store ownership logic (`users` + `admin_users`)

## Endpoints

### Read Endpoints (Store-Scoped)

1. `GET /crm/orders?storeRef=<storeDocIdOrSlug>&status=&q=&page=1&pageSize=25`
- Returns store orders
- Filters: `status`, free-text `q` on `uuid`, `STRIPE_PAYMENT_ID`, `Shipping_Address.email`

2. `GET /crm/subscribers?storeRef=<storeDocIdOrSlug>&syncStatus=&q=&page=1&pageSize=25`
- Returns store subscribers
- Filters: `syncStatus`, `q` on `Email` and `sendgrid_contact_id`

3. `GET /crm/newsletters?storeRef=<storeDocIdOrSlug>&status=&q=&page=1&pageSize=25`
- Returns store newsletters
- Filters: `status`, `q` on `title`, `subject`, `slug`

4. `GET /crm/customers?storeRef=<storeDocIdOrSlug>&q=&page=1&pageSize=25`
- Customer rollup (computed from orders + subscribers)
- Includes: `email`, `ordersCount`, `totalSpent`, `lastOrderAt`, `subscriber` summary

5. `GET /crm/stripe/connect?storeRef=<storeDocIdOrSlug>`
- Returns Stripe Connect status from `store.settings.meta`
- Also returns required integration config summary

### Action Endpoints (Placeholders)

6. `POST /crm/stripe/connect/onboarding?storeRef=<storeDocIdOrSlug>`
- Placeholder for Stripe Connect onboarding link generation
- Body (planned):
```json
{
  "data": {
    "refreshUrl": "https://app.example.com/settings/payments",
    "returnUrl": "https://app.example.com/settings/payments/success"
  }
}
```

7. `POST /crm/subscribers/:documentId/sync?storeRef=<storeDocIdOrSlug>`
- Placeholder for SendGrid subscriber sync

8. `POST /crm/newsletters/:documentId/send?storeRef=<storeDocIdOrSlug>`
- Placeholder for newsletter send orchestration
- Body (optional):
```json
{
  "data": {
    "mode": "single_send"
  }
}
```

## Placeholder Response Shape

Action routes currently return:
```json
{
  "ok": false,
  "action": "sendgrid.newsletter.send",
  "status": "placeholder",
  "reason": "...",
  "required": {
    "sdk": "@sendgrid/client",
    "env": ["SENDGRID_API_KEY"],
    "api": "https://docs.sendgrid.com/api-reference"
  },
  "payload": {}
}
```

## Integration Plan (SDK / API)

### Stripe Connect
- SDK: `stripe`
- Env:
  - `STRIPE_SECRET_KEY`
- API / Docs:
  - `https://docs.stripe.com/connect`
- Planned operations:
  - Create/retrieve connected account
  - Create Account Link (`account_onboarding`)
  - Store account status flags in `store.settings.meta`

### SendGrid Marketing
- SDK: `@sendgrid/client`
- Env:
  - `SENDGRID_API_KEY`
- API / Docs:
  - `https://docs.sendgrid.com/api-reference`
- Planned operations:
  - Upsert contact
  - Attach contact to lists
  - Trigger single send campaign

### SendGrid Mail (Fallback)
- SDK: `@sendgrid/mail`
- Env:
  - `SENDGRID_API_KEY`
  - `SENDGRID_FROM_EMAIL`
- API / Docs:
  - `https://docs.sendgrid.com/for-developers/sending-email/quickstart-nodejs`
- Planned operations:
  - Direct transactional sends

## Why This Namespace Split

- Keeps tienda API clean and focused on content CRUD/media workflows
- Enables separate role model later (`crm.view`, `crm.manage`, `crm.billing`)
- Lets us evolve CRM integrations independently without expanding tienda controller complexity
