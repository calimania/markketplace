# Services

## Overview

Services in this directory provide business logic and external integrations for the Markket api

## Service Architecture

### Stripe Integration

- `stripe.ts` - Core Stripe client and utilities
- `stripe-product.ts` - Product-specific operations
- `stripe-price.ts` - Price management
- `stripe-sync.ts` - Orchestration layer for syncing
- `stripe-security.ts` - Validation and security configuration

### Common

- `encryption.ts` - AES-256-CBC encryption for extension credentials

## Service Layer Principles

1. **Single Responsibility** - One service, one purpose
2. **Pure Functions** - Predictable inputs/outputs where possible
3. **Error Handling** - Graceful degradation, never crash
4. **Security First** - Validate inputs, sanitize logs, encrypt secrets
5. **Documentation** - Clear JSDoc comments and examples
