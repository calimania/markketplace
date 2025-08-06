# Customer API Documentation

## Overview

CRM functionality for managing customers within stores, including search capabilities, customer creation, and analytics

A customer can be related to Orders, Appointments and have internal notes

## Base URL

`/api/customers`

## Authentication

All endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

Handle role access via admin panel

## Store Access Control

All operations are scoped to stores that the authenticated user has access to. Users can only manage customers for stores they own or are admin users of.

---

## Endpoints

### 1. Get All Customers
```http
GET /api/customers
```

**Query Parameters:**
- Standard Strapi query parameters (filters, populate, sort, pagination)
- Automatically filtered by user's accessible stores

**Response:**
```json
{
  "data": [
    {
      "documentId": "cust_12345",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "totalSpent": 350.00,
      "totalSessions": 5,
      "isActive": true,
      "store": {
        "documentId": "store_abc123",
        "title": "Mystic Readings"
      }
    }
  ],
  "meta": {
    "pagination": { ... }
  }
}
```

### 2. Search Customers
```http
GET /api/customers/search
```

**Query Parameters:**
- `storeId` (required): Store document ID
- `query` (required): Search term (minimum 2 characters)
- `limit` (optional): Number of results (default: 10)

**Example:**
```javascript
// Search for customers by name, email, or phone
const response = await fetch('/api/customers/search?storeId=store_123&query=john&limit=5');
```

**Response:**
```json
{
  "data": [
    {
      "documentId": "cust_456",
      "email": "john@email.com",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890",
      "totalSpent": 350.00,
      "totalSessions": 5,
      "displayName": "John Doe",
      "recentAppointments": [
        {
          "documentId": "appt_789",
          "appointmentDate": "2025-08-01T14:00:00Z",
          "status": "completed",
          "type": "tarot_reading"
        }
      ],
      "recentOrders": [
        {
          "documentId": "order_101",
          "Amount": 75.00,
          "Status": "complete",
          "createdAt": "2025-07-28T10:00:00Z"
        }
      ],
      "searchMatch": {
        "email": false,
        "phone": false,
        "name": true
      }
    }
  ],
  "meta": {
    "query": "john",
    "storeId": "store_123",
    "count": 1,
    "hasMore": false
  }
}
```

### 3. Find Customer by Email
```http
GET /api/customers/find-by-email
```

**Query Parameters:**
- `storeId` (required): Store document ID
- `email` (required): Customer email address

**Example:**
```javascript
// Check if customer exists before creating appointment/order
const response = await fetch('/api/customers/find-by-email?storeId=store_123&email=sarah@email.com');
```

**Response (Customer Found):**
```json
{
  "data": {
    "documentId": "cust_789",
    "email": "sarah@email.com",
    "firstName": "Sarah",
    "lastName": "Smith",
    "phone": "+1987654321",
    "totalSpent": 200.00,
    "totalSessions": 3,
    "preferences": {
      "preferredTime": "afternoon",
      "reminderMethod": "email"
    },
    "communicationPreferences": {
      "emailMarketing": true,
      "smsReminders": false
    },
    "recentAppointments": [...],
    "recentOrders": [...],
    "user": {
      "username": "sarah_smith",
      "email": "sarah@email.com"
    }
  },
  "exists": true,
  "message": "Customer found"
}
```

**Response (Customer Not Found):**
```json
{
  "data": null,
  "exists": false,
  "message": "No customer found with this email for this store"
}
```

### 4. Get Store Customer Stats
```http
GET /api/customers/store/:storeId/stats
```

**Parameters:**
- `storeId`: Store document ID in URL path

**Example:**
```javascript
const response = await fetch('/api/customers/store/store_123/stats');
```

**Response:**
```json
{
  "data": {
    "totalCustomers": 150,
    "activeCustomers": 120,
    "inactiveCustomers": 30,
    "totalRevenue": 25000.50,
    "totalSessions": 450,
    "averageSpentPerCustomer": 166.67,
    "averageSessionsPerCustomer": 3.0
  }
}
```

### 5. Create Customer
```http
POST /api/customers
```

**Request Body:**
```json
{
  "data": {
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "phone": "+1555666777",
    "store": "store_123",
    "preferences": {
      "preferredTime": "morning"
    },
    "communicationPreferences": {
      "emailMarketing": true,
      "smsReminders": true
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "documentId": "cust_new123",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    // ... other fields
    "notes": "[{\"id\":\"1691234567890\",\"content\":\"Customer manually added to CRM\",\"author\":\"user_456\",\"createdAt\":\"2025-08-05T10:30:00Z\",\"isPrivate\":true,\"tags\":[\"crm\",\"manual-add\"]}]"
  }
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": {
    "status": 401,
    "name": "UnauthorizedError",
    "message": "Authentication required"
  }
}
```

### 403 Forbidden
```json
{
  "error": {
    "status": 403,
    "name": "ForbiddenError",
    "message": "You do not have access to this store"
  }
}
```

### 400 Bad Request
```json
{
  "error": {
    "status": 400,
    "name": "ValidationError",
    "message": "Search query must be at least 2 characters"
  }
}
```

---

## Notes Schema
Customer notes are stored as JSON arrays with the following structure:
```json
[
  {
    "id": "1691234567890",
    "content": "Customer prefers afternoon appointments",
    "author": "user_456",
    "createdAt": "2025-08-05T10:30:00Z",
    "isPrivate": false,
    "tags": ["preference", "scheduling"]
  }
]
```

## Store Isolation

Customer records are kept separate between different stores for privacy and accounting

