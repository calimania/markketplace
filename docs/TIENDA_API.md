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

---

## Content

Supports all content types: `article`, `page`, `product`, `event`, `album`, and more.
See [TIENDA_CONTENT_ENDPOINTS.md](./TIENDA_CONTENT_ENDPOINTS.md) for the full content-type table.

| Method | Path | Body / Query | Description |
|---|---|---|---|
| `GET` | `/api/tienda/stores/:ref/content/:type` | `?status=draft\|published&search=&page=&pageSize=` | List items — returns draft + published state per item |
| `POST` | `/api/tienda/stores/:ref/content/:type` | `{ …fields, publishNow?: true }` | Create item, optionally publish immediately |
| `GET` | `/api/tienda/stores/:ref/content/:type/:itemId` | `?status=draft\|published` | Get single item |
| `PUT` | `/api/tienda/stores/:ref/content/:type/:itemId` | `{ …fields, publishNow?: true, unpublishNow?: true, saveAsDraft?: true }` | Update — pass `publishNow` or `unpublishNow` to change publish state |
| `DELETE` | `/api/tienda/stores/:ref/content/:type/:itemId` | `{ hard?: true }` | Soft-delete (unpublish) by default; `hard: true` to permanently delete |

### Publish state on responses

Every content item includes a `tiendaPublication` block:

```json
{
  "tiendaPublication": {
    "hasDraft": true,
    "hasPublished": false,
    "visibleStatus": "unpublished"
  }
}
```

`visibleStatus` values:

| Value | Meaning |
|---|---|
| `published` | Live, no pending draft |
| `draft` | Published but has unpublished edits |
| `unpublished` | Never published or actively unpublished |

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

---

## Related Docs

- [TIENDA_CONTENT_ENDPOINTS.md](./TIENDA_CONTENT_ENDPOINTS.md) — Content type table, rate limits, field details
- [BUYER_ENDPOINTS.md](./BUYER_ENDPOINTS.md) — Public / buyer-facing endpoints
- [CRM_ENDPOINTS.md](./CRM_ENDPOINTS.md) — CRM / subscriber endpoints
- [stripe.md](./stripe.md) — Stripe integration
