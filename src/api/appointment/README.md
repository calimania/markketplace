# Appointment Management API

## Overview

The Appointment API provides comprehensive booking management for coaches, tarot readers, and other service providers. It supports both individual sessions and group classes with flexible participant management, auto-customer creation, and robust store access control.

## Key Features

- **Flexible Booking Types**: Individual sessions, group classes, workshops, seminars
- **Participant Management**: Users can join as participants, practitioners, or assistants
- **Auto-Customer Creation**: Automatically creates customer records from orders or user info
- **Store Access Control**: All operations require store context for security
- **Search & Discovery**: Find appointments by customer info
- **Capacity Management**: Group sessions with participant limits
- **Role-Based Access**: Different permissions for practitioners vs participants

## Schema Overview

### Core Fields

- `title`: Appointment title/name
- `appointmentDate`: When the appointment occurs
- `duration`: Length in minutes (default: 60)
- `type`: coaching, tarot_reading, consultation, group_class, workshop, etc.
- `appointmentFormat`: individual, group, class, workshop
- `maxParticipants`: Maximum capacity (default: 1)
- `currentParticipants`: Current participant count
- `status`: scheduled, confirmed, in_progress, completed, cancelled, etc.

### Participant System

The `participants` field is a JSON array containing participant objects:
```json
{
  "userId": "user_123",
  "userName": "John Doe",
  "userEmail": "john@example.com",
  "role": "participant", // or "practitioner", "assistant"
  "joinedAt": "2025-01-15T10:00:00Z",
  "status": "confirmed",
  "customerId": "customer_456" // optional
}
```

## API Endpoints

### Standard CRUD Operations
All require `?storeId=store_123` parameter for security.

#### Get Appointments
```http
GET /api/appointments?storeId=store_123
```

#### Get Single Appointment
```http
GET /api/appointments/appt_456?storeId=store_123
```

#### Create Appointment
```http
POST /api/appointments
Content-Type: application/json

{
  "data": {
    "title": "Tarot Reading Session",
    "store": "store_123",
    "appointmentDate": "2025-01-20T15:00:00Z",
    "duration": 60,
    "type": "tarot_reading",
    "appointmentFormat": "individual",
    "maxParticipants": 1,
    "price": 75.00,
    "customer": "customer_789", // optional
    "order": "order_456" // optional - will auto-create customer
  }
}
```

#### Update Appointment
```http
PUT /api/appointments/appt_456?storeId=store_123
Content-Type: application/json

{
  "data": {
    "status": "confirmed",
    "meetingLink": "https://zoom.us/j/123456789"
  }
}
```

### Participant Management

#### Join Appointment
Users can join appointments in different roles:

```http
POST /api/appointments/appt_456/join
Content-Type: application/json

{
  "storeId": "store_123",
  "role": "participant", // or "practitioner", "assistant"
  "customerInfo": { // optional for participants
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "phone": "+1234567890"
  }
}
```

#### Leave Appointment
```http
POST /api/appointments/appt_456/leave
Content-Type: application/json

{
  "storeId": "store_123"
}
```

#### Get My Appointments
Find all appointments where the user is a participant:

```http
GET /api/appointments/my-appointments?storeId=store_123&role=participant
```

Optional `role` parameter filters by: `participant`, `practitioner`, `assistant`

### Search & Discovery

#### Search by Customer
```http
GET /api/appointments/search-by-customer?storeId=store_123&query=jane@example.com&limit=10
```

Searches appointments by customer email, name, or phone.

## Implementation Notes

### Auto-Customer Creation
When creating appointments from orders, the system automatically:
1. Finds the order and extracts buyer information
2. Creates a customer record for the store
3. Links the appointment to the new customer
4. Adds creation notes for tracking

### Participant Management
- Users can join appointments in different roles
- Group sessions check capacity limits
- Customer records are auto-created when users join as participants
- Participants can leave appointments (updates capacity)

### Store Security
All operations require store access verification:
- Store ID must be provided in requests
- User access is verified via `checkUserStoreAccess`
- Appointments are filtered by store membership

### Search Functionality
The search system supports:
- Customer email, name, and phone lookup
- Appointment metadata search
- Result formatting with participant info
- Pagination and limits

## Error Handling

Common error responses:
- `400`: Missing required parameters (storeId, invalid data)
- `401`: Authentication required
- `403`: No access to store or appointment
- `404`: Appointment not found
- `409`: Capacity full, already enrolled
- `500`: Server errors

## Testing Examples

### Create Individual Appointment
```bash
curl -X POST http://localhost:1337/api/appointments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "data": {
      "title": "Personal Coaching Session",
      "store": "store_123",
      "appointmentDate": "2025-01-20T14:00:00Z",
      "duration": 90,
      "type": "coaching",
      "appointmentFormat": "individual",
      "price": 120.00
    }
  }'
```

### Create Group Class
```bash
curl -X POST http://localhost:1337/api/appointments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "data": {
      "title": "Meditation & Mindfulness Class",
      "store": "store_123",
      "appointmentDate": "2025-01-25T10:00:00Z",
      "duration": 120,
      "type": "group_class",
      "appointmentFormat": "class",
      "maxParticipants": 15,
      "price": 25.00
    }
  }'
```

### Join Group Class
```bash
curl -X POST http://localhost:1337/api/appointments/appt_456/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "storeId": "store_123",
    "role": "participant",
    "customerInfo": {
      "firstName": "Sarah",
      "lastName": "Johnson",
      "email": "sarah@example.com",
      "phone": "+1555123456"
    }
  }'
```

This comprehensive appointment system supports both simple individual bookings and complex group classes with full participant management, making it perfect for coaches, instructors, and service providers who need flexible booking solutions.
      }
    }
  ],
  "meta": {
    "pagination": { ... }
  }
}
```

### 2. Search Appointments by Customer
```http
GET /api/appointments/search-by-customer
```

**Query Parameters:**
- `storeId` (required): Store document ID
- `query` (required): Search term for customer info (minimum 2 characters)
- `limit` (optional): Number of results (default: 20)

**Example:**
```javascript
// Search appointments by customer name, email, or phone
const response = await fetch('/api/appointments/search-by-customer?storeId=store_123&query=sarah&limit=10');
```

**Response:**
```json
{
  "data": [
    {
      "documentId": "appt_123",
      "appointmentDate": "2025-08-10T14:00:00Z",
      "status": "confirmed",
      "type": "tarot_reading",
      "duration": 60,
      "price": 75.00,
      "customer": {
        "firstName": "Sarah",
        "lastName": "Smith",
        "email": "sarah@email.com",
        "phone": "+1987654321"
      },
      "order": {
        "uuid": "order_456",
        "Amount": 75.00,
        "Status": "complete"
      }
    }
  ],
  "meta": {
    "query": "sarah",
    "storeId": "store_123",
    "count": 1,
    "hasMore": false
  }
}
```

### 3. Create Appointment
```http
POST /api/appointments
```

**Request Body:**
```json
{
  "data": {
    "appointmentDate": "2025-08-15T15:00:00Z",
    "type": "coaching",
    "duration": 90,
    "price": 120.00,
    "status": "confirmed",
    "customer": "cust_456",
    "store": "store_123",
    "order": "order_789",
    "notes": "Client wants to focus on career goals",
    "meetingPlatform": "zoom",
    "meetingUrl": "https://zoom.us/j/123456789"
  }
}
```

**Auto-Customer Creation:**
If you provide an `order` but no `customer`, the system will automatically create a customer from the order's buyer information:

```json
{
  "data": {
    "appointmentDate": "2025-08-15T15:00:00Z",
    "type": "tarot_reading",
    "duration": 60,
    "price": 75.00,
    "store": "store_123",
    "order": "order_789"
    // No customer specified - will be auto-created
  }
}
```

**Response:**
```json
{
  "data": {
    "documentId": "appt_new123",
    "appointmentDate": "2025-08-15T15:00:00Z",
    "type": "coaching",
    "duration": 90,
    "price": 120.00,
    "status": "confirmed",
    "customer": {
      "documentId": "cust_auto456",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com"
    },
    "practitioner": {
      "documentId": "user_store_owner",
      "username": "mystic_reader"
    }
  }
}
```

### 4. Get Single Appointment
```http
GET /api/appointments/:documentId
```

**Parameters:**
- `documentId`: Appointment document ID in URL path

**Response:**
```json
{
  "data": {
    "documentId": "appt_123",
    "appointmentDate": "2025-08-10T14:00:00Z",
    "status": "confirmed",
    "type": "tarot_reading",
    "duration": 60,
    "price": 75.00,
    "internalNotes": [
      {
        "id": "note_1",
        "content": "Client is new to tarot readings",
        "author": "user_456",
        "createdAt": "2025-08-05T10:00:00Z",
        "isPrivate": true,
        "tags": ["new-client"]
      }
    ],
    "customer": { ... },
    "store": { ... },
    "order": { ... }
  }
}
```

### 5. Update Appointment
```http
PUT /api/appointments/:documentId
```

**Request Body:**
```json
{
  "data": {
    "status": "completed",
    "actualDuration": 65,
    "sessionNotes": [
      {
        "id": "session_note_1",
        "content": "Great session, client made breakthrough insights",
        "author": "user_456",
        "createdAt": "2025-08-10T15:05:00Z",
        "isPrivate": false,
        "tags": ["breakthrough", "positive"]
      }
    ]
  }
}
```

### 6. Delete Appointment
```http
DELETE /api/appointments/:documentId
```

**Response:**

```json
{
  "data": {
    "documentId": "appt_123"
  }
}
```

## Notes System

Appointments support three types of notes, all stored as JSON arrays:

### Internal Notes (`internalNotes`)

Private notes visible only to practitioners

```json
[
  {
    "id": "internal_1",
    "content": "Client mentioned anxiety about career change",
    "author": "user_456",
    "createdAt": "2025-08-05T10:00:00Z",
    "isPrivate": true,
    "tags": ["anxiety", "career"]
  }
]
```

### External Notes (`externalNotes`)

Notes that are surfaced to customers

```json
[
  {
    "id": "external_1",
    "content": "Recommended daily meditation practice",
    "author": "user_456",
    "createdAt": "2025-08-05T10:00:00Z",
    "isPrivate": false,
    "tags": ["recommendation", "meditation"]
  }
]
```

### Session Notes (`sessionNotes`)

Internal, session summary and updates

```json
[
  {
    "content": "All we have to decide is what to do with the time that is given to us",
    "createdAt": "2025-08-10T15:05:00Z",
    "isPrivate": false,
    "tags": ["wizard"]
  }
]
```

