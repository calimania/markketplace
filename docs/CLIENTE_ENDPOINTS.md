# Cliente Endpoints

Customer-facing endpoints.

Base URL:
- `/api/cliente`

Auth:
- JWT required
- Buyer identity is derived from authenticated user email
- Order lookup currently matches `Shipping_Address.email` using case-insensitive email equality
- `GET /cliente/rsvps/:documentId` is public (`auth: false`) for email/QR deep links

## Endpoints

1. `GET /cliente/orders?storeRef=&status=&q=&page=1&pageSize=25`
- Returns orders belonging to the authenticated buyer email
- Optional `storeRef` narrows to one store
- Optional `status` filters order status
- Optional `q` searches `uuid` and `Currency`

2. `GET /cliente/orders/:documentId`
- Returns a single order if it belongs to the authenticated buyer email

3. `POST /cliente/orders/:documentId/subscribe`
- Adds buyer email to the store default subscriber list for that order's store
- Reuses `subscriber.subscribeAndQueueSync`
- Good first step until a richer buyer profile or buyers relation exists

4. `GET /cliente/rsvps/:documentId`
- Public RSVP lookup by documentId for attendee confirmation pages
- Returns RSVP + event + store essentials for UI rendering
- Intended for links like `/rsvp?id=<documentId>` in client apps

## Notes

- This namespace is intentionally separate from `tienda` and `crm`.
- Current matching strategy is email-based, not a dedicated buyer relation.
- Later phase improvements:
  - explicit `buyer_email` normalized field on orders
  - dedicated `buyers` relation or profile model
  - post-purchase auto-subscribe based on checkout opt-in
  - unsubscribe preferences stored per store/order source
