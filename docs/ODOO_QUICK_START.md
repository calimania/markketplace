# Quick Start: Default Odoo Setup

**Goal**: All stores sync to Markket's central Odoo automatically
**Timeline**: Easy to start, iterate incrementally

---

## 1. Environment Setup

Add to `.env`:

```bash
# Markket's central Odoo instance
ODOO_DEFAULT_URL=https://markket-odoo.example.com/api/v2
ODOO_DEFAULT_DATABASE=markket_production
ODOO_DEFAULT_USERNAME=integration_user
ODOO_DEFAULT_API_KEY=your_odoo_api_key_here
```

---

## 2. Common Extension Configs (Ready to Use)

### A. Newsletter Sync (All Stores)

Add this extension to ALL stores (or as default):

```json
{
  "key": "markket:odoo:newsletter",
  "triggers": ["trigger:new_subscriber"],
  "credentials": {
    "use_default": true
  },
  "config": {
    "mailing_list_id": 1,
    "auto_subscribe": true,
    "tags": ["markket_platform"]
  },
  "active": true
}
```

**What happens**: Every new subscriber → Markket's Odoo mailing list

---

### B. Store Creation Sync

```json
{
  "key": "markket:odoo:store",
  "triggers": ["trigger:store_created"],
  "credentials": {
    "use_default": true
  },
  "config": {
    "create_as_partner": true,
    "partner_type": "customer",
    "sync_logo": true
  },
  "active": true
}
```

**What happens**: New store created → New partner in Markket's Odoo

---

### C. Product Sync (Platform Catalog)

```json
{
  "key": "markket:odoo:product",
  "triggers": ["trigger:product_created", "trigger:product_updated"],
  "credentials": {
    "use_default": true
  },
  "config": {
    "sync_to_central": true,
    "create_product_template": true,
    "store_field": "x_markket_store_id"
  },
  "active": true
}
```

**What happens**: Product changes → Synced to central catalog in Odoo

---

### D. Order Tracking

```json
{
  "key": "markket:odoo:order",
  "triggers": ["trigger:post_sale"],
  "credentials": {
    "use_default": true
  },
  "config": {
    "create_sale_order": true,
    "auto_confirm": false,
    "store_field": "x_markket_store_id"
  },
  "active": true
}
```

**What happens**: Sale completed → Sale order in Markket's Odoo

---

## 3. Manual Test (Before Implementation)

You can add these extensions NOW via Strapi admin or API:

```bash
# Example: Add newsletter extension to a store
curl -X PUT "http://localhost:1337/api/stores/STORE_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "extensions": [
        {
          "key": "markket:odoo:newsletter",
          "triggers": ["trigger:new_subscriber"],
          "credentials": { "use_default": true },
          "config": { "mailing_list_id": 1 },
          "active": true
        }
      ]
    }
  }'
```

They'll be stored but not executed until runner is implemented.

---

## 4. Implementation Priority (Future PR)

### Phase 1: Newsletter Sync (Easiest)
```
markket:odoo:newsletter
├─ Trigger: trigger:new_subscriber
├─ Action: Add email to Odoo mailing list
└─ Impact: Centralized email marketing
```

**Why first**: Simple, high value, low risk

### Phase 2: Store Sync
```
markket:odoo:store
├─ Trigger: trigger:store_created
├─ Action: Create partner in Odoo
└─ Impact: Track all stores centrally
```

**Why second**: Foundation for other syncs

### Phase 3: Product Sync
```
markket:odoo:product
├─ Trigger: trigger:product_created, trigger:product_updated
├─ Action: Sync product data to Odoo
└─ Impact: Central catalog, analytics
```

**Why third**: More complex, needs store context

### Phase 4: Order Sync
```
markket:odoo:order
├─ Trigger: trigger:post_sale
├─ Action: Create sale order in Odoo
└─ Impact: Financial tracking, fulfillment
```

**Why fourth**: Most complex, depends on products/stores

---

## 5. Customer-Specific Odoo (Later)

When enterprise customer wants their own Odoo:

```json
{
  "key": "markket:odoo:product",
  "triggers": ["trigger:product_updated"],
  "credentials": {
    "database": "customer_db",
    "username": "customer_user",
    "api_key": "customer_key"
  },
  "config": {
    "customer_id": "acme_corp",
    "custom_field_mapping": {
      "internal_sku": "x_sku"
    }
  },
  "url": "https://customer-odoo.com/api",
  "active": true
}
```

Same extension code, different credentials!

---

## 6. Default Extensions Template

Create a template for all new stores:

```typescript
// When creating a store, auto-add these
const DEFAULT_STORE_EXTENSIONS = [
  {
    key: 'markket:odoo:newsletter',
    triggers: ['trigger:new_subscriber'],
    credentials: { use_default: true },
    config: { mailing_list_id: 1 },
    active: true
  },
  {
    key: 'markket:odoo:store',
    triggers: ['trigger:store_created'],
    credentials: { use_default: true },
    active: true
  }
];

// In store creation handler
const newStore = await strapi.documents('api::store.store').create({
  data: {
    title: 'New Store',
    slug: 'new-store',
    extensions: DEFAULT_STORE_EXTENSIONS
  }
});
```

---

## 7. Marketing Lists Setup

Each store gets its own mailing list in Odoo:

### Create List in Odoo (Per Store)

```python
# In Odoo: Mailing Lists
{
  'name': 'Store A - Newsletter',
  'x_markket_store_id': 'store_abc123_documentId',
  'active': True,
  'is_public': False
}
```

Then add list ID to store's extension config:

```json
{
  "key": "markket:odoo:newsletter",
  "config": {
    "mailing_list_id": 5  // ← This list ID from Odoo
  }
}
```

### Marketing Flow

```
Subscriber → Odoo List → Campaign → Sendgrid → Email Sent
                ↓                        ↓
          Dashboard shows            Stats via
          subscriber list            webhooks
```

**See [docs/marketing-architecture.md](./marketing-architecture.md) for complete marketing setup.**

---

## 8. What You Can Do Right Now

✅ **Add extensions to existing stores** (via admin or API)  
✅ **Test extension schema** (CRUD operations)  
✅ **Plan Odoo field mappings** (what data to sync)  
✅ **Document workflows** (what happens when)  
✅ **Set up Odoo dev instance** (for testing)  
✅ **Create mailing lists per store** (for marketing)  
✅ **Configure Sendgrid in Odoo** (for email delivery)  

❌ Extensions won't execute yet (need runner implementation)  
❌ Triggers won't fire (need middleware)  
❌ Dashboard marketing UI (future PR)  

---

## 9. Odoo Fields to Prepare

### For Newsletter (mailing.contact)
- `email` ← Subscriber.Email
- `name` ← Subscriber.name or "Subscriber"
- `list_ids` ← Config mailing_list_id
- `tag_ids` ← Config tags

### For Mailing Lists (mailing.list)
- `name` ← "Store Name - Newsletter"
- `x_markket_store_id` ← Store.documentId (custom field)
- `active` ← true
- `is_public` ← false

### For Campaigns (mailing.mailing)
- `subject` ← Campaign subject
- `mailing_list_ids` ← Store's mailing list
- `body_html` ← From Sendgrid template
- `x_markket_campaign_id` ← Campaign UUID (custom field)
- `x_sendgrid_template_id` ← Template ID (custom field)

### For Store (res.partner)
- `name` ← Store.title
- `comment` ← Store.Description
- `image_1920` ← Store.Logo
- `street` ← Store.addresses[0].street
- `city` ← Store.addresses[0].city
- `x_markket_store_id` ← Store.documentId (custom field)
- `x_markket_slug` ← Store.slug (custom field)

### For Product (product.template)
- `name` ← Product.Name
- `default_code` ← Product.SKU
- `list_price` ← Product.usd_price
- `description` ← Product.Description
- `x_markket_product_id` ← Product.documentId
- `x_markket_store_id` ← Product.stores[0].documentId

### For Order (sale.order)
- `partner_id` ← Buyer's partner ID
- `x_markket_order_id` ← Order.uuid
- `x_markket_store_id` ← Order.store.documentId
- `amount_total` ← Order.Amount
- Order lines from Order.Details

---

## 10. Sendgrid Configuration in Odoo

Configure Sendgrid integration in Odoo (one-time setup):

```python
# Odoo Settings → Email Marketing → Sendgrid
{
  'sendgrid_api_key': 'SG....',
  'sendgrid_sender_email': 'noreply@markket.place',
  'sendgrid_webhook_url': 'https://markket-odoo.com/sendgrid/webhook',
  'track_opens': True,
  'track_clicks': True
}
```

This allows Odoo campaigns to send via Sendgrid and receive stats.

---

## Next Steps

1. ✅ Merge this PR (schema ready)
2. ⏳ Set up Odoo dev instance
3. ⏳ Create custom fields in Odoo
4. ⏳ Implement extension runner (next PR)
5. ⏳ Implement `markket:odoo:newsletter` (first extension)
6. ⏳ Test and iterate

**This PR establishes the foundation. Implementation follows incrementally!** 🚀
