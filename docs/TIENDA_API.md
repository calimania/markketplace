# Tienda API — Store Owner Namespace

All endpoints live under `/api/tienda` and require a valid JWT.

```
Authorization: Bearer <token>
```

The `:ref` param accepts either a **documentId** or a **slug** on all store-scoped routes.

---

## Stores

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/tienda/stores` | — | List all stores the logged-in user owns |
| `GET` | `/api/tienda/stores/:ref` | — | Get a single owned store (drafts visible) |
| `GET` | `/api/tienda/:ref` | — | Short alias for `/stores/:ref` |
| `POST` | `/api/tienda/stores` | `{ title, slug, … }` | Create store — auto-connects creator, auto-publishes |
| `PUT` | `/api/tienda/stores/:ref` | `{ title?, slug?, … }` | Update store fields |
| `GET` | `/api/tienda/stores/:ref/settings` | — | Get store settings |
| `PUT` | `/api/tienda/stores/:ref/settings` | `{ … }` | Update store settings |
| `GET` | `/api/tienda/tendero/:ref` | — | Lightweight ownership check — returns `{ ok, store: { documentId, slug } }` |

---

## Content

Supports all content types: `article`, `page`, `product`, `event`, `album`, and more.
See [TIENDA_CONTENT_ENDPOINTS.md](./TIENDA_CONTENT_ENDPOINTS.md) for the full content-type table.

| Method | Path | Body / Query | Description |
|---|---|---|---|
| `GET` | `/api/tienda/stores/:ref/content/:type` | `?status=draft\|published&search=&page=&pageSize=&filters[…]=…&populate=…` | List items — returns draft + published state per item |
| `POST` | `/api/tienda/stores/:ref/content/:type` | `{ …fields, publishNow?: true }` | Create item, optionally publish immediately |
| `GET` | `/api/tienda/stores/:ref/content/:type/:itemId` | `?status=draft\|published&populate=…` | Get single item |
| `PUT` | `/api/tienda/stores/:ref/content/:type/:itemId` | `{ …fields, publishNow?: true, unpublishNow?: true, saveAsDraft?: true }` | Update — pass `publishNow` or `unpublishNow` to change publish state |
| `DELETE` | `/api/tienda/stores/:ref/content/:type/:itemId` | `{ hard?: true }` | Soft-delete (unpublish) by default; `hard: true` to permanently delete |

### Publish state on responses

Every content item includes a `tiendaPublication` block:

```json
{
  "tiendaPublication": {
    "hasDraft": true,
    "hasPublished": true,
    "visibleStatus": "draft"
  }
}
```

`visibleStatus` values:

| Value | Meaning |
|---|---|
| `published` | Live, no unsaved edits |
| `draft` | Live **and** has pending unpublished edits — dashboard shows the draft for preview/editing |
| `unpublished` | Only a draft exists (never published) or was soft-deleted |

Public storefront consumers should always request `?status=published`. The owner dashboard omits `status` to get the merged preview view.

### SEO & social image

All SEO-enabled types always return a populated `SEO.socialImage` — no extra populate param needed:

```json
{
  "SEO": {
    "metaTitle": "…",
    "metaDescription": "…",
    "socialImage": { "url": "https://…", "width": 1200, "height": 630 },
    "metaUrl": "…",
    "metaAuthor": "…",
    "excludeFromSearch": false
  }
}
```

Use `SEO.socialImage` for `og:image` / Twitter card meta tags.

### Extra populate & filters

Both list and single-item endpoints accept `populate` and `filters` query params merged safely with the mandatory store scope:

```
?populate=cover,Tags&filters[active][$eq]=true
```

Store ownership scoping is always enforced regardless of client filters.

---

## Slug Validation (store create / update)

Slugs are normalised automatically before saving:

- Accents stripped, spaces converted to `-`, lowercased
- Rules: 2–96 chars, only `a-z 0-9 -`, no leading/trailing hyphens
- **400** returned if format is invalid
- **409** returned if slug is already taken

---

## Other Store Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tienda/stores/:ref/upload` | Upload a media file to the store |
| `GET` | `/api/tienda/stores/:ref/media-targets` | List uploadable fields (for upload UI) |
| `GET` | `/api/tienda/stores/:ref/events/:eventId/rsvps` | List RSVPs for an event |
| `POST` | `/api/tienda/stores/:ref/events/:eventId/rsvps/sync` | Sync RSVPs to SendGrid |
| `POST` | `/api/tienda/stores/:ref/invite` | Send a collaborator invite by email |
| `GET` | `/api/tienda/stores/:ref/invites` | List all invites sent for the store |

---

## Collaborator Invites

Store members can invite collaborators by email. Invitees receive a one-time 24-hour magic link. On acceptance they are automatically authenticated and added to the store — no password needed.

---

### Send an invite

```
POST /api/tienda/stores/:ref/invite
Authorization: Bearer {JWT}
Content-Type: application/json
```

**Request body**
```json
{ "email": "collaborator@example.com" }
```

**Success — 200**
```json
{
  "ok": true,
  "message": "Invite sent to collaborator@example.com.",
  "store": {
    "documentId": "abc123xyz",
    "slug": "my-store"
  }
}
```

**Error responses**

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": { "message": "A valid email address is required." } }` | Missing or malformed email |
| 403 | `{ "error": { "message": "Store not found or access denied." } }` | Not an owner/member of this store |
| 429 | `{ "error": { "message": "Too many invites sent recently. Please wait before sending another." } }` | Rate limit hit |

**JS example**
```js
const res = await fetch(`/api/tienda/stores/${storeRef}/invite`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'collaborator@example.com' }),
});
const data = await res.json();
// data.ok === true on success
```

---

### List invites

```
GET /api/tienda/stores/:ref/invites
Authorization: Bearer {JWT}
```

**Success — 200**
```json
{
  "store": {
    "documentId": "abc123xyz",
    "slug": "my-store"
  },
  "total": 3,
  "invites": [
    {
      "email": "alex@example.com",
      "status": "accepted",
      "sentAt": "2026-05-19T10:00:00.000Z",
      "acceptedAt": "2026-05-19T10:42:00.000Z",
      "expiresAt": "2026-05-20T10:00:00.000Z"
    },
    {
      "email": "sam@example.com",
      "status": "pending",
      "sentAt": "2026-05-19T11:00:00.000Z",
      "acceptedAt": null,
      "expiresAt": "2026-05-20T11:00:00.000Z"
    },
    {
      "email": "old@example.com",
      "status": "expired",
      "sentAt": "2026-05-01T08:00:00.000Z",
      "acceptedAt": null,
      "expiresAt": "2026-05-02T08:00:00.000Z"
    }
  ]
}
```

`status` is derived at read time:

| Value | Meaning |
|-------|---------|
| `pending` | Email sent, link not clicked yet |
| `accepted` | Invitee clicked the link and joined |
| `expired` | 24-hour window passed without acceptance |

> The one-time magic code is **never** returned in this response.

**JS example**
```js
const res = await fetch(`/api/tienda/stores/${storeRef}/invites`, {
  headers: { 'Authorization': `Bearer ${jwt}` },
});
const { invites, total } = await res.json();
```

---

### Invite acceptance flow (invitee side)

The invitee receives a branded email with a single **Accept invite** button. The link has the form:

```
https://markket.place/auth/magic?code={ONE_TIME_CODE}
```

Your client app calls the verify endpoint with that code:

```
GET /api/auth-magic/verify?code={ONE_TIME_CODE}
```

**Success — 200**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 42,
    "username": "collaborator",
    "email": "collaborator@example.com"
  }
}
```

Store that `jwt` and use it as `Authorization: Bearer` for all subsequent calls. The invitee is already added to the store — no extra step needed.

If the code is invalid, already used, or expired:

**Error — 400**
```json
{ "error": { "message": "Invalid or expired magic link." } }
```

**JS example (in your `/auth/magic` page)**
```js
const code = new URL(window.location.href).searchParams.get('code');
const res = await fetch(`/api/auth-magic/verify?code=${code}`);
if (!res.ok) {
  // show "Link expired — ask the store owner to resend"
  return;
}
const { jwt, user } = await res.json();
localStorage.setItem('jwt', jwt);
// redirect to dashboard
```

---

## Related Docs

- [TIENDA_CONTENT_ENDPOINTS.md](./TIENDA_CONTENT_ENDPOINTS.md) — Content type table, rate limits, field details
- [BUYER_ENDPOINTS.md](./BUYER_ENDPOINTS.md) — Public / buyer-facing endpoints
- [CRM_ENDPOINTS.md](./CRM_ENDPOINTS.md) — CRM / subscriber endpoints
- [stripe.md](./stripe.md) — Stripe integration
