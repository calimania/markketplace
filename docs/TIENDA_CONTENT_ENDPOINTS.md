# Tienda Content Endpoints Documentation

**Phase 1 Implementation** - Store owner content management API with analytics, search, and rate limiting.

## Base URL

```
http://localhost:1337/api/tienda
```

## Authentication

All endpoints require JWT Token passed via:
```
Authorization: Bearer {JWT_TOKEN}
```

Get token via `/api/auth/local/register` or `/api/auth/local`

## Content Types

| Type | UID | Title Field | Store Relation | Draft Support |
|------|-----|-------------|-----------------|---------------|
| article | `api::article.article` | `Title` | manyToOne | ✅ Yes |
| page | `api::page.page` | `Title` | manyToOne | ✅ Yes |
| album | `api::album.album` | `title` | manyToOne | ✅ Yes |
| track | `api::album.track` | `title` | manyToOne | ✅ Yes |
| category | `api::category.category` | `Name` | manyToOne | ✅ Yes |
| product | `api::product.product` | `Name` | manyToMany | ✅ Yes |
| event | `api::event.event` | `Name` | manyToMany | ✅ Yes |
| shortner | `api::shortner.shortner` | `title` | manyToOne | ❌ No |

## Rate Limits

Per store per minute:
- **CREATE**: 60 items/min (1/sec)
- **UPDATE**: 120 items/min (2/sec)
- **DELETE**: 10 items/min (hard limit)
- **LIST**: 300 items/min (very generous)

Rate limit headers on 429 response:
```
X-RateLimit-Reset: 2026-04-13T10:15:30.000Z
```

---

## Endpoints

### 1. List Content Items

**GET** `/stores/:ref/content/:contentType`

List all items of a specific type for a store with pagination, search, and filtering.

**Path Parameters:**
- `ref` (string) - Store documentId or slug
- `contentType` (string) - One of: `article`, `page`, `album`, `track`, `category`, `product`, `event`, `shortner`

**Query Parameters:**
- `page` (int, default: 1) - Page number
- `pageSize` (int, default: 25, max: 100) - Items per page
- `search` (string) - Search across title, keywords, description
- `status` (string) - Filter by `draft` or `published` (only for draftAndPublish types)

**Example Request:**
```bash
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:1337/api/tienda/stores/my-store/content/article?page=1&pageSize=25&search=news"
```

**Response (200):**
```json
{
  "ok": true,
  "data": [
    {
      "documentId": "abc123",
      "Title": "Breaking News",
      "slug": "breaking-news",
      "Content": "Lorem ipsum...",
      "Tags": ["news", "featured"],
      "cover": { "url": "/uploads/image.jpg" },
      "publishedAt": "2026-04-13T09:00:00.000Z",
      "createdAt": "2026-04-12T15:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 127,
    "pages": 6
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Missing or invalid JWT
- `403 Forbidden` - Store not found or user has no access
- `400 Bad Request` - Invalid content type
- `429 Too Many Requests` - Rate limit exceeded

---

### 2. Create Content Item

**POST** `/stores/:ref/content/:contentType`

Create a new content item in the store.

**Path Parameters:**
- `ref` (string) - Store documentId or slug
- `contentType` (string) - One of the supported types

**Request Body:**
```json
{
  "data": {
    "Title": "My Article",
    "Content": "Lorem ipsum dolor sit amet...",
    "Tags": ["featured", "news"],
    "keywords": "article, news, trending",
    "description": "Short description for search",
    "publishNow": true
  }
}
```

**Mutable Fields by Type:**

| Type | Mutable Fields |
|------|---|
| article | Title, slug, Content, cover, Tags, SEO, category, description, keywords |
| page | Title, slug, Content, Active, menuOrder, SEO, albums, description, keywords |
| album | title, slug, description, content, SEO, cover, tracks, keywords |
| track | title, slug, description, content, SEO, media, urls, keywords |
| category | Name, slug, Description, SEO, Active, keywords |
| product | Name, Description, attributes, usd_price, quantity, active, Thumbnail, Slides, SEO, Tag, PRICES, keywords, description |
| event | Name, Description, usd_price, startDate, endDate, maxCapacity, active, Thumbnail, Slides, SEO, Tag, PRICES, keywords, description |
| shortner | title, url, description, image, keywords |

**Auto-Populated Fields:**
- `SEO.metaTitle` ← Auto-filled from Title field (first 60 chars)
- `SEO.metaDescription` ← Auto-filled from Content field (first 160 chars, if empty)
- `createdBy` ← Current user ID
- `createdAt` ← Current timestamp
- `views` ← Initialized to 0
- Store relation ← Automatically connected

**Example Request:**
```bash
curl -X POST -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "Title": "Getting Started",
      "Content": "Here is a comprehensive guide...",
      "Tags": ["tutorial"],
      "keywords": "guide, getting started",
      "publishNow": true
    }
  }' \
  http://localhost:1337/api/tienda/stores/my-store/content/article
```

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "documentId": "xyz789",
    "Title": "Getting Started",
    "Content": "Here is a comprehensive guide...",
    "Tags": ["tutorial"],
    "keywords": "guide, getting started",
    "SEO": {
      "metaTitle": "Getting Started",
      "metaDescription": "Here is a comprehensive guide..."
    },
    "views": 0,
    "createdBy": 12,
    "createdAt": "2026-04-13T10:15:00.000Z",
    "publishedAt": "2026-04-13T10:15:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid content type or missing required fields
- `401 Unauthorized` - Missing or invalid JWT
- `403 Forbidden` - Store not accessible
- `429 Too Many Requests` - Create rate limit exceeded

---

### 3. Get Single Content Item

**GET** `/stores/:ref/content/:contentType/:itemId`

Retrieve a single content item and increment view counter.

**Path Parameters:**
- `ref` (string) - Store documentId or slug
- `contentType` (string) - Content type
- `itemId` (string) - Item documentId

**Example Request:**
```bash
curl -H "Authorization: Bearer $JWT" \
  http://localhost:1337/api/tienda/stores/my-store/content/article/abc123
```

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "documentId": "abc123",
    "Title": "Breaking News",
    "Content": "...",
    "views": 43,
    "lastViewedAt": "2026-04-13T10:20:15.000Z",
    "publishedAt": "2026-04-13T09:00:00.000Z"
  }
}
```

**Behavior:**
- View counter is incremented asynchronously (non-blocking)
- `lastViewedAt` is updated on successful retrieval
- If item not owned by store, returns 403 Forbidden

**Error Responses:**
- `401 Unauthorized` - Missing JWT
- `403 Forbidden` - Item not found or store mismatch
- `404 Not Found` - Item does not exist

---

### 4. Update Content Item

**PUT** `/stores/:ref/content/:contentType/:itemId`

Update an existing content item.

**Path Parameters:**
- `ref` (string) - Store documentId or slug
- `contentType` (string) - Content type
- `itemId` (string) - Item documentId

**Request Body:**
```json
{
  "data": {
    "Title": "Updated Title",
    "Content": "Updated content...",
    "tags": ["new-tag"],
    "publishNow": true
  }
}
```

**Special Fields:**
- `publishNow: true` - Publish the item (if draftAndPublish type)
- `unpublishNow: true` - Unpublish the item (if draftAndPublish type)

**Auto-Filled Fields:**
- SEO fields are re-filled if title/content changed and SEO was empty
- Read-only fields (SKU, slug for product) are ignored if present in request

**Example Request:**
```bash
curl -X PUT -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "Title": "Updated Title",
      "publishNow": true
    }
  }' \
  http://localhost:1337/api/tienda/stores/my-store/content/article/abc123
```

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "documentId": "abc123",
    "Title": "Updated Title",
    "publishedAt": "2026-04-13T10:25:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid content type
- `401 Unauthorized` - Missing JWT
- `403 Forbidden` - Item not found or store mismatch
- `404 Not Found` - Item does not exist
- `429 Too Many Requests` - Update rate limit exceeded

---

### 5. Delete Content Item

**DELETE** `/stores/:ref/content/:contentType/:itemId`

Delete a content item (unpublish first if draftAndPublish, then delete).

**Path Parameters:**
- `ref` (string) - Store documentId or slug
- `contentType` (string) - Content type
- `itemId` (string) - Item documentId

**Example Request:**
```bash
curl -X DELETE -H "Authorization: Bearer $JWT" \
  http://localhost:1337/api/tienda/stores/my-store/content/article/abc123
```

**Response (200):**
```json
{
  "ok": true,
  "message": "Content deleted successfully"
}
```

**Behavior:**
- Items are unpublished first (if applicable) to avoid orphaned published documents
- Hard delete from database
- Strict rate limiting (10/min per store)

**Error Responses:**
- `401 Unauthorized` - Missing JWT
- `403 Forbidden` - Item not found or store mismatch
- `404 Not Found` - Item does not exist
- `429 Too Many Requests` - Delete rate limit exceeded

---

### 6. Upload Store Media

**POST** `/stores/:ref/upload`

Upload one or more files for a store using Strapi Upload plugin.

**Path Parameters:**
- `ref` (string) - Store documentId or slug

**Content-Type:**
- `multipart/form-data`

**Form Fields:**
- `files` or `file` - One file or an array of files
- `caption` (optional) - Caption applied to uploaded files
- `altText` or `alternativeText` (optional) - Fallback alt text applied to all files
- `fileInfo` (optional) - JSON array/object with per-file metadata (`name`, `caption`, `alternativeText`)
- `attach` (optional) - JSON object to auto-attach uploaded files to a content media field

**Attach Object:**
```json
{
  "contentType": "product",
  "itemId": "<documentId>",
  "field": "Slides",
  "mode": "replace"
}
```

- `contentType`: one of `store`, `article`, `album`, `track`, `product`, `event`, `shortner`
- `field`: allowed media fields by type
  - `store.Logo`, `store.Cover`, `store.Slides`, `store.Favicon`
  - `article.cover`
  - `album.cover`
  - `track.media`
  - `product.Thumbnail`, `product.Slides`
  - `event.Thumbnail`, `event.Slides`
  - `shortner.image`
- `mode`:
  - `replace` (default): replace existing media in target field
  - `append`: only valid for multi-file fields (`Slides`)

Notes:
- `itemId` is required for non-store content types.
- For `contentType=store`, `itemId` is optional and defaults to the current route store.

**Validation Rules:**
- Max files per request: 10
- Max file size: 4.2 MB per file
- Allowed types:
  - `image/*`
  - `video/*`
  - `audio/*`
  - `application/pdf`
  - `text/plain`
  - `application/json`

**Example Request (single file):**
```bash
curl -X POST \
  -H "Authorization: Bearer $JWT" \
  -F "file=@/path/to/banner.png" \
  -F "caption=Store homepage banner" \
  http://localhost:1337/api/tienda/stores/my-store/upload
```

**Example Request (multiple files):**
```bash
curl -X POST \
  -H "Authorization: Bearer $JWT" \
  -F "files=@/path/to/photo-1.jpg" \
  -F "files=@/path/to/photo-2.jpg" \
  http://localhost:1337/api/tienda/stores/my-store/upload
```

**Example Request (per-file metadata + slides replace):**
```bash
curl -X POST \
  -H "Authorization: Bearer $JWT" \
  -F "files=@/path/to/slide-1.jpg" \
  -F "files=@/path/to/slide-2.jpg" \
  -F 'fileInfo=[{"alternativeText":"Hero slide 1","caption":"Spring launch"},{"alternativeText":"Hero slide 2","caption":"Category highlight"}]' \
  -F 'attach={"contentType":"product","itemId":"prod_document_id","field":"Slides","mode":"replace"}' \
  http://localhost:1337/api/tienda/stores/my-store/upload
```

**Response (200):**
```json
{
  "ok": true,
  "data": [
    {
      "id": 101,
      "documentId": "q2x3...",
      "name": "my-store-1713037914000-banner.png",
      "mime": "image/png",
      "size": 132.4,
      "url": "https://cdn.example.com/uploads/my-store-1713037914000-banner.png",
      "provider": "aws-s3",
      "createdAt": "2026-04-13T15:50:01.000Z"
    }
  ],
  "attachment": {
    "contentType": "product",
    "itemId": "prod_document_id",
    "field": "Slides",
    "mode": "replace",
    "uploadedCount": 2
  }
}
```

**Error Responses:**
- `400 Bad Request` - No files, unsupported MIME, or oversize payload
- `401 Unauthorized` - Missing or invalid JWT
- `403 Forbidden` - Store not accessible
- `429 Too Many Requests` - Upload rate limit exceeded
- `500 Internal Server Error` - Upload provider error

---

### 7. Media Targets (Attributes for Client UI)

**GET** `/stores/:ref/media-targets`

Returns backend-defined attachable media attributes so Next.js can render target/field pickers without hardcoding.

**Example Request:**
```bash
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:1337/api/tienda/stores/my-store/media-targets"
```

**Response (200):**
```json
{
  "ok": true,
  "store": {
    "documentId": "store_doc_id",
    "slug": "my-store"
  },
  "targets": [
    {
      "contentType": "product",
      "uid": "api::product.product",
      "fields": [
        {
          "field": "Thumbnail",
          "mode": "single",
          "allowedTypes": ["images"]
        },
        {
          "field": "Slides",
          "mode": "multiple",
          "allowedTypes": ["images"]
        }
      ]
    }
  ]
}
```

Use this endpoint to drive upload forms dynamically by content type + field mode (`single` or `multiple`).

---

## Store Reference Resolution

The `ref` parameter supports:
- **documentId**: `abc123def456...`
- **slug**: `my-store`, `acme-corp`

Priority: documentId is checked first, then slug.

---

## SEO Auto-Fill Behavior

When creating or updating content, the system automatically fills empty SEO fields:

```
SEO.metaTitle ← Title field (truncated to 60 chars)
SEO.metaDescription ← Content field (truncated to 160 chars)
```

Non-destructive: Only fills if fields are empty. Existing SEO data is never overwritten.

---

## Analytics Fields

**Coming in Phase 2** — Analytics fields will be added once schema updates are deployed:

| Field | Type | Description |
|-------|------|-------------|
| `views` | integer | View counter (incremented on GET) |
| `lastViewedAt` | ISO datetime | Timestamp of last retrieval |
| `createdAt` | ISO datetime | Creation timestamp |
| `createdBy` | integer | User ID of creator |

In Phase 1, `createdAt` and `createdBy` are tracked. View counting requires schema field additions and will ship in Phase 2.

---

## Search Behavior

The `search` query parameter searches across:
1. Title field (e.g., `Title` for articles)
2. `keywords` field (comma-separated tags)
3. `description` field (short text)

Search is case-insensitive and partial-match.

**Example:**
```
GET /stores/my-store/content/article?search=trending
```

Returns all articles with "trending" in Title, keywords, or description.

---

## Error Responses

### 400 Bad Request
```json
{
  "message": "Invalid content type",
  "status": 400
}
```

### 401 Unauthorized
```json
{
  "message": "Authentication required",
  "status": 401
}
```

### 403 Forbidden
```json
{
  "message": "Resource unavailable",
  "status": 403
}
```

### 404 Not Found
```json
{
  "message": "Content not found",
  "status": 404
}
```

### 429 Too Many Requests
```json
{
  "message": "Rate limit exceeded",
  "status": 429
}
```
Header: `X-RateLimit-Reset: 2026-04-13T10:15:30.000Z`

### 500 Internal Server Error
```json
{
  "message": "Request failed",
  "status": 500
}
```

---

## Client Integration Examples

### JavaScript/Node.js
```javascript
const token = 'eyJhbGciOiJIUzI1NiIs...';
const storeRef = 'my-store';

// List articles
async function listArticles() {
  const res = await fetch(
    `http://localhost:1337/api/tienda/stores/${storeRef}/content/article?page=1&pageSize=25`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return res.json();
}

// Create article
async function createArticle(title, content) {
  const res = await fetch(
    `http://localhost:1337/api/tienda/stores/${storeRef}/content/article`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: { Title: title, Content: content, publishNow: true }
      })
    }
  );
  return res.json();
}

// Update article
async function updateArticle(itemId, updates) {
  const res = await fetch(
    `http://localhost:1337/api/tienda/stores/${storeRef}/content/article/${itemId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: updates })
    }
  );
  return res.json();
}

// Delete article
async function deleteArticle(itemId) {
  const res = await fetch(
    `http://localhost:1337/api/tienda/stores/${storeRef}/content/article/${itemId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return res.json();
}
```

### TypeScript Client
```typescript
interface ContentListResponse {
  ok: boolean;
  data: any[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

interface ContentItemResponse {
  ok: boolean;
  data: any;
}

class TiendaClient {
  constructor(private baseUrl: string, private token: string) {}

  async listContent(
    storeRef: string,
    contentType: string,
    options?: { page?: number; pageSize?: number; search?: string; status?: string }
  ): Promise<ContentListResponse> {
    const params = new URLSearchParams({
      page: String(options?.page || 1),
      pageSize: String(options?.pageSize || 25),
      ...(options?.search && { search: options.search }),
      ...(options?.status && { status: options.status })
    });

    const res = await fetch(
      `${this.baseUrl}/stores/${storeRef}/content/${contentType}?${params}`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    return res.json();
  }

  async createContent(
    storeRef: string,
    contentType: string,
    data: Record<string, any>
  ): Promise<ContentItemResponse> {
    const res = await fetch(
      `${this.baseUrl}/stores/${storeRef}/content/${contentType}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data })
      }
    );
    return res.json();
  }
}
```

---

## Pagination Best Practices

- Default page size is 25 items
- Maximum page size is 100 items
- Empty results return `data: []` with `total: 0`
- Always check `pagination.pages` to determine if more pages exist

---

## Roadmap

**Phase 1.5** (Implemented):
- Upload endpoint: `POST /stores/:ref/upload`
- File validation and store ownership checks
- DO Spaces integration through Strapi Upload plugin

**Phase 2**:
- Bulk operations: Create/update/delete multiple items in one request
- Export: CSV/JSON export of content

**Phase 3**:
- SendGrid integration: Auto-sync newsletter subscribers when content published
- Scheduled publishing: Schedule content to publish at future date/time

**Phase 4**:
- Stripe product sync: Auto-sync product prices with Stripe
- Product variant management

**Phase 5**:
- Webhook events: Subscribe to content lifecycle events (created, published, deleted)
- Activity tracking and audit logs
