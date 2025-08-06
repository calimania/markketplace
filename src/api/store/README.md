# Store Access Control Documentation

## Overview

The Store Access Control system provides a centralized method for verifying user permissions across all store-related operations in the marketplace. This ensures proper security and data isolation between different stores.

## Core Function

### `checkUserStoreAccess(strapi, userId, storeId)`

Located in: `/src/api/store/controllers/store.ts`

**Purpose:** Efficiently verify if a user has access to a specific store and return relevant store information.

**Parameters:**
- `strapi`: Strapi instance
- `userId`: User ID (string)
- `storeId`: Store document ID (string)

**Returns:**
```typescript
{
  hasAccess: boolean,
  store: StoreDocument | null,
  isAdmin: boolean
}
```

**Usage:**
```typescript
import { checkUserStoreAccess } from '../../store/controllers/store';

const { hasAccess, store, isAdmin } = await checkUserStoreAccess(strapi, user.id, storeId);
if (!hasAccess) {
  return ctx.forbidden('You do not have access to this store');
}
```

---

## Access Control Logic

The function checks two types of store relationships:

### 1. Regular Store Users (`users`)
Users who have been added to the store's `users` relation field.

### 2. Admin Users (`admin_users`)
Users who have administrative privileges for the store via the `admin_users` relation field.

**Access is granted if the user exists in EITHER array.**

---

## Implementation Details

### Database Query
```typescript
const store = await strapi.documents('api::store.store').findOne({
  documentId: storeId,
  populate: ['users', 'admin_users', 'settings'],
}) as any;
```

### User Comparison
```typescript
const isStoreUser = store.users?.some((user: any) => user.id === parseInt(userId));
const isAdminUser = store.admin_users?.some((admin: any) => admin.id === parseInt(userId));
```

**Note:** Uses `parseInt(userId)` to ensure proper ID comparison between string and number types.

---

## Usage Across APIs

### Customer API
```typescript
// Create customer with store verification
if (data.store) {
  const { hasAccess } = await checkUserStoreAccess(strapi, user.id, data.store);
  if (!hasAccess) {
    return ctx.forbidden('You do not have access to this store');
  }
}
```

### Appointment API
```typescript
// Auto-create customer from order
if (data.order && !data.customer) {
  const { hasAccess } = await checkUserStoreAccess(strapi, user.id, data.store);
  if (!hasAccess) {
    return ctx.forbidden('You do not have access to this store');
  }
  // ... customer creation logic
}
```

### Store Settings API
```typescript
const { hasAccess, store, isAdmin } = await checkUserStoreAccess(strapi, userId, id);
if (!hasAccess) {
  return ctx.forbidden(`403:store:${store.title}`);
}
```

---

## Best Practices

### 1. **Always Import from Store Controller**
```typescript
import { checkUserStoreAccess } from '../../store/controllers/store';
```

### 2. **Check Access Before Operations**
```typescript
const { hasAccess } = await checkUserStoreAccess(strapi, user.id, storeId);
if (!hasAccess) {
  return ctx.forbidden('You do not have access to this store');
}
```

### 3. **Use Store Context When Available**
```typescript
const { hasAccess, store, isAdmin } = await checkUserStoreAccess(strapi, user.id, storeId);
if (!hasAccess) {
  return ctx.forbidden(`403:store:${store.title}`);
}

// Use store data for further operations
if (store.settings) {
  // Handle existing settings
}
```

### 4. **Handle Edge Cases**
```typescript
if (!store) {
  return ctx.notFound('Store not found');
}
```

---

## Integration Examples

### Customer Search with Store Filtering
```typescript
// Custom endpoint: Search customers by email, phone, or name
async searchCustomers(ctx) {
  const { storeId, query } = ctx.query;
  const user = ctx.state.user;

  // Verify access using shared function
  const { hasAccess } = await checkUserStoreAccess(strapi, user.id, storeId);
  if (!hasAccess) {
    return ctx.forbidden('You do not have access to this store');
  }

  // Perform search within authorized store
  const customers = await strapi.documents('api::customer.customer').findMany({
    filters: {
      store: { documentId: storeId },
      $or: [
        { email: { $containsi: query } },
        { firstName: { $containsi: query } }
      ]
    }
  });

  return ctx.send({ data: customers });
}
```

### Appointment Management with Auto-Assignment
```typescript
// Set the store owner as practitioner if not specified
if (!data.practitioner && data.store) {
  const { store } = await checkUserStoreAccess(strapi, user.id, data.store);
  if (store && store.users && store.users.length > 0) {
    data.practitioner = store.users[0].documentId;
  }
}
```

---

## Error Handling

### Common Error Responses
```typescript
// 401 - Not authenticated
if (!user) {
  return ctx.unauthorized('Authentication required');
}

// 403 - No store access
if (!hasAccess) {
  return ctx.forbidden('You do not have access to this store');
}

// 404 - Store not found
if (!store) {
  return ctx.notFound('Store not found');
}
```

### Logging and Debugging
```typescript
console.log(`Store access check: user=${userId}, store=${storeId}, hasAccess=${hasAccess}`);
```

---

## Performance Considerations

### 1. **Single Query Design**
The function makes only one database query to fetch all necessary information.

### 2. **Relation Pre-loading**
All required relations are populated in the initial query:
```typescript
populate: ['users', 'admin_users', 'settings']
```

### 3. **Memory Efficiency**
Results are used immediately without storing large objects in memory.

### 4. **Caching Opportunities**
Store access data could be cached for frequently accessed stores:
```typescript
// Future enhancement: Redis caching
const cacheKey = `store_access:${userId}:${storeId}`;
```

---

## Testing Store Access

### Unit Test Example
```typescript
describe('checkUserStoreAccess', () => {
  it('should grant access to store users', async () => {
    const mockStore = {
      documentId: 'store_123',
      users: [{ id: 456 }],
      admin_users: []
    };

    strapi.documents = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(mockStore)
    });

    const result = await checkUserStoreAccess(strapi, '456', 'store_123');

    expect(result.hasAccess).toBe(true);
    expect(result.isAdmin).toBe(false);
  });
});
```

### Integration Test
```typescript
// Test store isolation
it('should only return data from accessible stores', async () => {
  const response = await request(app)
    .get('/api/customers')
    .set('Authorization', `Bearer ${userToken}`)
    .expect(200);

  // All returned customers should belong to user's stores
  response.body.data.forEach(customer => {
    expect(userStoreIds).toContain(customer.store.documentId);
  });
});
```
