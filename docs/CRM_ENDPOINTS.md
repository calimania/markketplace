# CRM Endpoints

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

5. `GET /pagos/connect?storeRef=<storeDocIdOrSlug>&stripe_test=true|false`
- Returns Stripe Connect status for the store
- Tries live sync from Stripe first, then falls back to `store.settings.meta`
- Includes account flags: `charges_enabled`, `payouts_enabled`, `requirements_due`, `requirements_past_due`, `disabled_reason`

### Action Endpoints

6. `POST /pagos/connect/onboarding?storeRef=<storeDocIdOrSlug>&stripe_test=true|false`
- Creates or reuses the connected account
- Returns Stripe Account Link (`account_onboarding`)
- Body:
```json
{
  "data": {
    "refreshUrl": "https://app.example.com/settings/payments",
    "returnUrl": "https://app.example.com/settings/payments/success",
    "country": "US"
  }
}
```

7. `POST /pagos/connect/resume?storeRef=<storeDocIdOrSlug>&stripe_test=true|false`
- Alias for onboarding link regeneration (resume incomplete onboarding)
- Same body as onboarding

8. `POST /pagos/connect/review-link?storeRef=<storeDocIdOrSlug>&stripe_test=true|false`
- Creates Stripe Account Link (`account_update`) for KYC/requirements review
- Body (optional):
```json
{
  "data": {
    "refreshUrl": "https://app.example.com/settings/payments",
    "returnUrl": "https://app.example.com/settings/payments/success"
  }
}
```

9. `POST /pagos/connect/dashboard-link?storeRef=<storeDocIdOrSlug>&stripe_test=true|false`
- Creates temporary Stripe Express dashboard login link
- Body (optional):
```json
{
  "data": {
    "returnUrl": "https://app.example.com/settings/payments"
  }
}
```

10. `POST /crm/subscribers/:documentId/sync?storeRef=<storeDocIdOrSlug>`
- Placeholder for SendGrid subscriber sync

11. `POST /crm/newsletters/:documentId/send?storeRef=<storeDocIdOrSlug>`
- Placeholder for newsletter send orchestration
- Body (optional):
```json
{
  "data": {
    "mode": "single_send"
  }
}
```

## Stripe Connect Client Flow

1. On "Connect Stripe" click, call onboarding endpoint.
2. Redirect user to `data.url` from response.
3. On return, call status endpoint and render requirements if present.
4. If `status` is `pending` or `restricted`, show "Continue setup" using review-link or resume endpoint.
5. If `status` is `active`, show "Open Stripe dashboard" using dashboard-link endpoint.

## Placeholder Response Shape

SendGrid action routes currently return:
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
  - `STRIPE_SECRET_TEST_KEY` (recommended for test mode)
- API / Docs:
  - `https://docs.stripe.com/connect`
- Implemented operations:
  - Create/reuse connected account (`STRIPE_CUSTOMER_ID`)
  - Create Account Link (`account_onboarding`)
  - Create Account Link (`account_update`) for reviews
  - Create Express dashboard login links
  - Sync account status flags into `store.settings.meta`

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
