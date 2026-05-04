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

---

## Related Docs

- [TIENDA_CONTENT_ENDPOINTS.md](./TIENDA_CONTENT_ENDPOINTS.md) — Content type table, rate limits, field details
- [BUYER_ENDPOINTS.md](./BUYER_ENDPOINTS.md) — Public / buyer-facing endpoints
- [CRM_ENDPOINTS.md](./CRM_ENDPOINTS.md) — CRM / subscriber endpoints
- [stripe.md](./stripe.md) — Stripe integration
