# Marketing Architecture: Odoo + Sendgrid

**Pattern**: Odoo manages lists/campaigns → Sendgrid sends emails → Dashboard shows stats
**Privacy**: Customer data in Markket's Odoo (or customer's own instance for HIPAA/compliance)

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                    Markket Platform                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Store Dashboard                                           │
│  ├─ Marketing Lists (from Odoo API)                        │
│  ├─ Campaign Manager (send via Odoo → Sendgrid)           │
│  ├─ Send History (from Odoo + Sendgrid stats)             │
│  └─ Analytics (opens, clicks, bounces)                    │
│                                                             │
└─────────────────┬──────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ↓                   ↓
┌───────────────┐   ┌──────────────────┐
│ Markket Odoo  │   │ Sendgrid API     │
│               │   │                  │
│ • Contacts    │   │ • Email Delivery │
│ • Lists       │──→│ • Templates      │
│ • Segments    │   │ • Stats/Events   │
│ • Campaigns   │   │ • Suppressions   │
└───────────────┘   └──────────────────┘
```

---

## Flow: Subscriber → Marketing List

### 1. New Subscriber Created

```json
// Store extension
{
  "key": "markket:odoo:newsletter",
  "triggers": ["trigger:new_subscriber"],
  "credentials": { "use_default": true },
  "config": {
    "mailing_list_id": 5,  // Each store has its own list ID
    "auto_subscribe": true,
    "tags": ["markket_store_123", "newsletter"],
    "sync_to_sendgrid": false  // Odoo → Sendgrid sync happens in Odoo
  },
  "active": true
}
```

**What happens**:
1. User subscribes on Store A
2. Extension triggers
3. Contact created in Odoo mailing list #5 (Store A's list)
4. Tagged with store identifier
5. Odoo syncs to Sendgrid contact list (behind the scenes)

---

## Flow: Campaign Creation & Sending

### 2. Dashboard: "Create Campaign" Button

```typescript
// Dashboard UI
POST /api/stores/:storeId/campaigns/create
{
  "subject": "New Product Launch",
  "template_id": "d-abc123",  // Sendgrid template
  "segment": "all",           // or "buyers", "subscribers", etc.
  "schedule": "2025-12-05T10:00:00Z"  // optional
}
```

**Backend creates extension** (one-time campaign):
```json
{
  "key": "markket:odoo:campaign",
  "triggers": [],  // Manual trigger only
  "credentials": { "use_default": true },
  "config": {
    "campaign_id": null,  // Will be set after Odoo creates it
    "mailing_list_id": 5,
    "subject": "New Product Launch",
    "sendgrid_template_id": "d-abc123",
    "segment": "all",
    "status": "draft",
    "scheduled_date": "2025-12-05T10:00:00Z"
  },
  "active": false  // Not active yet
}
```

### 3. Dashboard: "Send Campaign" Button

```typescript
// Dashboard UI
POST /api/stores/:storeId/campaigns/:campaignId/send

// Backend:
// 1. Creates campaign in Odoo (mailing.mailing)
// 2. Odoo triggers Sendgrid API
// 3. Sendgrid sends emails
// 4. Stats flow back to both systems
```

**Extension executes**:
```typescript
// src/extensions/markket/odoo/campaign.ts

export default async function handler({ entity, credentials, config, extension }) {
  const odoo = resolveOdooCredentials({ credentials });

  // 1. Create campaign in Odoo
  const campaign = await createOdooMailing({
    odoo,
    mailing_list_id: config.mailing_list_id,
    subject: config.subject,
    body_html: await getSendgridTemplate(config.sendgrid_template_id),
    scheduled_date: config.scheduled_date
  });

  // 2. Odoo internally calls Sendgrid
  // (Odoo has Sendgrid integration configured)

  // 3. Update extension meta with campaign ID and stats
  const updatedMeta = {
    ...extension.meta,
    odoo_campaign_id: campaign.id,
    sendgrid_batch_id: campaign.sendgrid_batch_id,
    sent_count: campaign.expected_recipients,
    execution_log: [
      ...(extension.meta?.execution_log || []),
      {
        timestamp: new Date().toISOString(),
        status: 'sent',
        recipients: campaign.expected_recipients
      }
    ]
  };

  return {
    success: true,
    meta: updatedMeta  // Extension runner will save this
  };
}
```

---

## Flow: Dashboard Stats Display

### 4. Dashboard: View Campaign Stats

```typescript
// Dashboard UI requests stats
GET /api/stores/:storeId/campaigns/:campaignId/stats

// Backend calls Odoo API
const odooStats = await getOdooCampaignStats(campaignId);

// Response:
{
  "campaign_id": "123",
  "subject": "New Product Launch",
  "sent": 1250,
  "delivered": 1200,
  "opened": 480,
  "clicked": 120,
  "bounced": 50,
  "unsubscribed": 5,
  "sent_date": "2025-12-05T10:00:00Z",
  "sendgrid_stats": {
    "opens": 480,
    "unique_opens": 350,
    "clicks": 120,
    "unique_clicks": 85
  }
}
```

**Odoo stores Sendgrid webhook data**, so stats come from Odoo API.

---

## Extension Configurations

### Store-Level Marketing Extensions

Each store gets these extensions for marketing:

```json
[
  {
    "key": "markket:odoo:newsletter",
    "triggers": ["trigger:new_subscriber"],
    "credentials": { "use_default": true },
    "config": {
      "mailing_list_id": 5,  // Unique per store
      "auto_subscribe": true
    },
    "active": true
  },
  {
    "key": "markket:odoo:campaign",
    "triggers": [],  // Manual only (dashboard button)
    "credentials": { "use_default": true },
    "config": {
      "mailing_list_id": 5,
      "campaigns": []  // Array of campaign configs
    },
    "active": true
  },
  {
    "key": "markket:sendgrid:stats",
    "triggers": ["trigger:sendgrid_webhook"],
    "credentials": {
      "api_key": "SG...."  // Markket's Sendgrid key
    },
    "config": {
      "track_opens": true,
      "track_clicks": true,
      "store_in_odoo": true
    },
    "active": true
  }
]
```

---

## Odoo Configuration

### Mailing Lists (mailing.list)

Each store gets its own mailing list in Odoo:

```python
# In Odoo
{
  'name': 'Store A - Newsletter',
  'x_markket_store_id': 'store_documentId_here',
  'active': True,
  'is_public': False
}
```

### Contacts (mailing.contact)

Subscribers synced from Markket:

```python
{
  'email': 'subscriber@example.com',
  'name': 'John Doe',
  'list_ids': [(4, 5)],  # Store A's list
  'tag_ids': [(4, tag_id)],
  'x_markket_subscriber_id': 'subscriber_documentId',
  'x_markket_store_id': 'store_documentId'
}
```

### Campaigns (mailing.mailing)

Created when "Send Campaign" clicked:

```python
{
  'subject': 'New Product Launch',
  'mailing_list_ids': [(4, 5)],
  'body_html': '<html>...</html>',  # From Sendgrid template
  'scheduled_date': '2025-12-05 10:00:00',
  'mailing_type': 'mail',
  'reply_to': 'noreply@store-a.markket.place',
  'x_markket_campaign_id': 'campaign_uuid',
  'x_sendgrid_template_id': 'd-abc123'
}
```

### Odoo → Sendgrid Integration

Odoo has built-in or custom integration that:
1. Takes campaign from `mailing.mailing`
2. Sends via Sendgrid API
3. Receives Sendgrid webhooks (opens, clicks, bounces)
4. Stores stats in Odoo

---

## Dashboard API Endpoints

### List Marketing Lists

```typescript
GET /api/stores/:storeId/marketing/lists

Response:
{
  "lists": [
    {
      "id": 5,
      "name": "Store A - Newsletter",
      "contact_count": 1250,
      "active_contacts": 1200,
      "last_campaign": "2025-11-20T14:00:00Z"
    }
  ]
}
```

### Get Subscribers

```typescript
GET /api/stores/:storeId/marketing/subscribers
  ?list_id=5
  &limit=50
  &offset=0

Response:
{
  "subscribers": [
    {
      "email": "user@example.com",
      "name": "John Doe",
      "subscribed_date": "2025-10-01T12:00:00Z",
      "tags": ["newsletter", "buyer"],
      "campaigns_received": 5,
      "last_opened": "2025-11-15T09:30:00Z"
    }
  ],
  "total": 1250,
  "page": 1,
  "pages": 25
}
```

### Create Campaign

```typescript
POST /api/stores/:storeId/marketing/campaigns

Body:
{
  "subject": "New Product Launch",
  "sendgrid_template_id": "d-abc123",
  "list_id": 5,
  "segment": "all",  // or "opened_last_campaign", "buyers", etc.
  "schedule": "2025-12-05T10:00:00Z"  // optional, null = send now
}

Response:
{
  "campaign_id": "camp_abc123",
  "odoo_campaign_id": 456,
  "status": "draft",
  "estimated_recipients": 1200
}
```

### Send Campaign

```typescript
POST /api/stores/:storeId/marketing/campaigns/:campaignId/send

Response:
{
  "campaign_id": "camp_abc123",
  "status": "sending",
  "scheduled_for": "2025-12-05T10:00:00Z",
  "estimated_recipients": 1200
}
```

### Get Campaign Stats

```typescript
GET /api/stores/:storeId/marketing/campaigns/:campaignId

Response:
{
  "campaign_id": "camp_abc123",
  "subject": "New Product Launch",
  "status": "sent",
  "sent_date": "2025-12-05T10:00:00Z",
  "stats": {
    "sent": 1200,
    "delivered": 1150,
    "bounced": 50,
    "opened": 480,
    "unique_opened": 350,
    "clicked": 120,
    "unique_clicked": 85,
    "unsubscribed": 5,
    "open_rate": 0.417,
    "click_rate": 0.104
  },
  "sendgrid_template_id": "d-abc123"
}
```

### List Campaigns (History)

```typescript
GET /api/stores/:storeId/marketing/campaigns
  ?status=sent
  &limit=20

Response:
{
  "campaigns": [
    {
      "campaign_id": "camp_abc123",
      "subject": "New Product Launch",
      "sent_date": "2025-12-05T10:00:00Z",
      "recipients": 1200,
      "open_rate": 0.417,
      "click_rate": 0.104
    }
  ],
  "total": 45
}
```

---

## Privacy & Compliance

### Default (Non-HIPAA Stores)

- ✅ Subscriber data in Markket's Odoo
- ✅ Centralized management
- ✅ Platform-wide analytics
- ✅ Shared infrastructure cost

```json
{
  "credentials": { "use_default": true }
}
```

### HIPAA/Compliance Stores

- ✅ Subscriber data in customer's own Odoo
- ✅ Full data isolation
- ✅ Customer manages compliance
- ✅ Customer pays for infrastructure

```json
{
  "credentials": {
    "database": "healthcare_prod",
    "api_key": "customer_key"
  },
  "url": "https://healthcare-odoo.com/api"
}
```

**Same dashboard, same features, different backend!**

---

## Sendgrid Integration Details

### Sendgrid Configuration in Odoo

Odoo needs Sendgrid configured (one-time setup):

```python
# Odoo Settings
{
  'sendgrid_api_key': 'SG....',
  'sendgrid_sender_email': 'noreply@markket.place',
  'sendgrid_webhook_url': 'https://markket-odoo.com/sendgrid/webhook',
  'track_opens': True,
  'track_clicks': True
}
```

### Sendgrid Webhooks → Odoo

Sendgrid sends events to Odoo:

```json
// Sendgrid → Odoo webhook
{
  "event": "open",
  "email": "user@example.com",
  "timestamp": 1733140800,
  "campaign_id": "456",
  "url": null
}
```

Odoo stores these and exposes via API.

---

## Dashboard UI Flow

### Marketing Tab in Store Dashboard

```
┌─────────────────────────────────────────────────────────┐
│  Marketing                                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📊 Overview                                            │
│  ├─ Subscribers: 1,250                                  │
│  ├─ Campaigns Sent: 45                                  │
│  ├─ Avg Open Rate: 38.5%                                │
│  └─ Avg Click Rate: 9.2%                                │
│                                                          │
│  📧 Campaigns                                           │
│  ┌────────────────────────────────────────────────┐    │
│  │ [+ Create Campaign]                             │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Recent Campaigns:                                      │
│  ┌────────────────────────────────────────────────┐    │
│  │ ✅ New Product Launch                          │    │
│  │    Sent: Dec 5, 10:00 AM                       │    │
│  │    📊 1,200 sent • 480 opened (40%) • 120 clicks│    │
│  │    [View Stats] [Duplicate]                     │    │
│  ├────────────────────────────────────────────────┤    │
│  │ ✅ Holiday Sale                                │    │
│  │    Sent: Nov 20, 2:00 PM                       │    │
│  │    📊 1,180 sent • 450 opened (38%) • 95 clicks │    │
│  ├────────────────────────────────────────────────┤    │
│  │ 📝 Welcome Series (Draft)                      │    │
│  │    [Edit] [Send Now] [Schedule]                 │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  👥 Subscribers (1,250)                                 │
│  ┌────────────────────────────────────────────────┐    │
│  │ user@example.com    Nov 15 • Opened 3/5        │    │
│  │ buyer@test.com      Oct 22 • Opened 2/5        │    │
│  │ [View All] [Export]                             │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Extension Execution Example

### Campaign Send Flow

```typescript
// User clicks "Send Campaign" button
// → POST /api/stores/123/marketing/campaigns/camp_abc/send

// 1. Find campaign extension
const store = await strapi.documents('api::store.store').findOne({
  documentId: storeId
});

const campaignExt = store.extensions.find(
  e => e.key === 'markket:odoo:campaign'
);

// 2. Execute extension
const result = await runExtension(campaignExt, {
  action: 'send',
  campaign_id: campaignId
});

// 3. Extension handler (markket/odoo/campaign.ts) does:
async function handler({ entity, credentials, config, context }) {
  const odoo = resolveOdooCredentials({ credentials });

  // Get campaign config
  const campaign = config.campaigns.find(c => c.id === context.campaign_id);

  // Create in Odoo
  const odooMailing = await fetch(`${odoo.url}/mailing.mailing`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${odoo.api_key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'mailing.mailing',
        method: 'create',
        args: [{
          subject: campaign.subject,
          mailing_list_ids: [[6, 0, [config.mailing_list_id]]],
          body_html: await fetchSendgridTemplate(campaign.sendgrid_template_id),
          scheduled_date: campaign.schedule || null,
          // Odoo will use its Sendgrid integration to send
        }]
      }
    })
  });

  // Trigger send in Odoo
  await fetch(`${odoo.url}/mailing.mailing/${odooMailing.id}/action_send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${odoo.api_key}` }
  });

  return { success: true, odoo_campaign_id: odooMailing.id };
}
```

---

## Benefits of This Architecture

### ✅ Odoo as Marketing Hub
- Professional mailing list management
- Segmentation capabilities
- Campaign scheduling
- Stats aggregation
- Subscriber lifecycle management

### ✅ Sendgrid for Delivery
- High deliverability
- Template management
- Real-time webhooks
- Bounce handling
- Reputation management

### ✅ Dashboard Integration
- Store owners see everything
- One-click campaign creation
- Live stats
- No Odoo/Sendgrid knowledge needed

### ✅ Privacy Flexibility
- Default: Markket's Odoo (easy, cheap)
- HIPAA: Customer's Odoo (compliant, isolated)
- Same UX either way

---

## Next Steps (After Extension Runner)

1. **Odoo Setup**
   - Create mailing lists for each store
   - Configure Sendgrid integration
   - Set up webhook endpoints

2. **Extension Implementation**
   - `markket:odoo:newsletter` - Subscriber sync
   - `markket:odoo:campaign` - Campaign management
   - `markket:sendgrid:stats` - Webhook receiver

3. **Dashboard API**
   - Marketing endpoints
   - Odoo API client
   - Stats aggregation

4. **Dashboard UI**
   - Marketing tab
   - Campaign creator
   - Stats visualizations

**This PR: Schema ready. Implementation: Multiple future PRs.** 🚀
