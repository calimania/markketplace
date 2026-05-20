# Invite Flow API

Store invite endpoints for adding collaborators via magic links.

---

## 1. Send Invite

**POST** `/api/tienda/stores/:ref/invite`

**Auth**: Required (Bearer JWT)

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Success (200)**:
```json
{
  "ok": true,
  "message": "Invite sent to user@example.com.",
  "store": {
    "documentId": "abc123",
    "slug": "my-store"
  }
}
```

**Alternate Success (200, resend)**:
```json
{
  "ok": true,
  "message": "Invite re-sent to user@example.com with a new link.",
  "store": {
    "documentId": "abc123",
    "slug": "my-store"
  }
}
```

**Errors**: `400` (bad email), `401` (no JWT), `403` (not owner), `404` (store not found), `409` (already a store member), `429` (rate limit), `500` (server)

**What happens**:
1. Invite is stored as **one row per store + email**.
2. If the same email is invited again, the existing invite row is refreshed with a new code and expiry (no second row).
3. Recipient gets a purpose-specific invite email:
  - First invite: editor invite copy (includes inviter name when available)
   - Resend: refreshed-invite copy and subject
4. Invite link expires in 24h.

---

## 2. List Invites

**GET** `/api/tienda/stores/:ref/invites`

**Auth**: Required (Bearer JWT)

**Success (200)**:
```json
{
  "store": {
    "documentId": "abc123",
    "slug": "my-store"
  },
  "invites": [
    {
      "email": "user@example.com",
      "status": "pending",
      "sentAt": "2026-05-19T10:30:00Z",
      "acceptedAt": null,
      "expiresAt": "2026-05-20T10:30:00Z"
    }
  ],
  "total": 1
}
```

**Status values**: `pending`, `accepted`, `expired`

**List behavior**:
- Response is de-duplicated by email (latest invite state per email)
- `sentAt` reflects the latest invite send/update timestamp

**Errors**: `401`, `403`, `404`

---

## 3. Verify/Accept Invite

**POST** `/api/auth-magic/verify`

**Auth**: Not required (public)

**Request Body**:
```json
{
  "code": "abc123xyz789"
}
```

**Success (200)**:
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 42,
    "username": "user@example.com",
    "email": "user@example.com",
    "confirmed": true
  },
  "channel": "email"
}
```

**Errors**: `400` (missing code), `401` (invalid/expired code), `500` (server)

**What happens**:
1. Existing user is found by email or a new confirmed user is created
2. Existing unconfirmed users are auto-confirmed
3. User logged in (JWT issued)
4. User added to invited store (store.users relation)
5. Welcome email sent to user

**Debug logs to watch in terminal**:
- `[AUTH_MAGIC] store_invite: processing`
- `[AUTH_MAGIC] store_invite: store found`
- `[AUTH_MAGIC] store_invite: alreadyMember`
- `[AUTH_MAGIC] store_invite: user connected to store`

---

## Implementation Example (JavaScript)

```javascript
// STEP 1: Store owner sends invite
async function sendInvite(storeRef, email, jwtToken) {
  const res = await fetch(`/api/tienda/stores/${storeRef}/invite`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  return res.json();
}

// STEP 2: Recipient clicks email link and lands on your page
// Page URL: https://your-domain.com/invite?code=abc123xyz789
// (Email says: "You've been invited to join {storeName}" with accept button)

// Extract code from URL
function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('code');
}

// STEP 3: Verify code and get JWT
async function acceptInvite() {
  const code = getCodeFromUrl();

  if (!code) {
    console.error('No invite code in URL');
    return null;
  }

  const res = await fetch('/api/auth-magic/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    console.error('Verification failed:', res.status);
    return null;
  }

  const data = await res.json();

  // Store JWT for future requests
  localStorage.setItem('jwt', data.jwt);
  localStorage.setItem('user', JSON.stringify(data.user));

  console.log(`✓ Joined! Welcome, ${data.user.username}`);
  return data;
}

// STEP 4: Use JWT for authenticated API calls
const jwt = localStorage.getItem('jwt');
const headerWithJwt = {
  'Authorization': `Bearer ${jwt}`,
  'Content-Type': 'application/json',
};
```

---

## Emails Sent

**Invite Email (first send)**:
- From: SendGrid (Strapi Email Plugin)
- Subject: `{storeName} invited you to be an editor`
- Contains: editor invite copy with inviter name (when available) + accept button + 24-hour expiration notice

**Invite Email (resend)**:
- From: SendGrid (Strapi Email Plugin)
- Subject: `{storeName}: your refreshed invite link`
- Contains: lean refreshed editor-invite copy and clear replacement/expiration notice

**Welcome Email** (after accepting):
- From: SendGrid
- Subject: `You joined {storeName} on Markketplace`
- Contains: Welcome message + dashboard link
