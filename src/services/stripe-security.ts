/**
 * Security configuration for Stripe integration
 */

// Rate limiting configuration
export const RATE_LIMITS = {
  STRIPE_API_CALLS_PER_MINUTE: 100,
  MAX_PRODUCT_NAME_LENGTH: 250,
  MAX_DESCRIPTION_LENGTH: 10000,
  MAX_IMAGE_URL_LENGTH: 2048,
  MAX_IMAGES_PER_PRODUCT: 8,
};

// Data validation patterns
export const VALIDATION = {
  ALLOWED_CURRENCIES: ['usd', 'eur', 'gbp', 'cad', 'aud'],
  MIN_PRICE_CENTS: 50, // $0.50 minimum
  MAX_PRICE_CENTS: 99999999, // $999,999.99 maximum
};

// Security logging configuration
export const SECURITY_CONFIG = {
  LOG_SENSITIVE_DATA: process.env.NODE_ENV === 'development',
  REDACT_STRIPE_IDS: process.env.NODE_ENV === 'production',
  ENABLE_DETAILED_LOGGING: process.env.STRIPE_DEBUG === 'true',
};

/**
 * Sanitize data for logging
 */
export function sanitizeForLogging(data: any, fieldName: string): any {
  if (!SECURITY_CONFIG.LOG_SENSITIVE_DATA) {
    if (fieldName.includes('ID') || fieldName.includes('Key') || fieldName.includes('Secret')) {
      return '[REDACTED]';
    }
  }

  if (typeof data === 'string' && data.length > 100) {
    return data.substring(0, 100) + '...';
  }

  return data;
}

/**
 * Validate product data before processing
 */
export function validateProductData(product: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!product) {
    errors.push('Product data is required');
    return { valid: false, errors };
  }

  if (!product.documentId) {
    errors.push('Product documentId is required');
  }

  if (!product.Name || typeof product.Name !== 'string') {
    errors.push('Product name is required and must be a string');
  } else if (product.Name.length > RATE_LIMITS.MAX_PRODUCT_NAME_LENGTH) {
    errors.push(`Product name too long (max ${RATE_LIMITS.MAX_PRODUCT_NAME_LENGTH} characters)`);
  }

  if (product.Description && typeof product.Description === 'string' && product.Description.length > RATE_LIMITS.MAX_DESCRIPTION_LENGTH) {
    errors.push(`Product description too long (max ${RATE_LIMITS.MAX_DESCRIPTION_LENGTH} characters)`);
  }

  if (Array.isArray(product.PRICES)) {
    product.PRICES.forEach((price: any, index: number) => {
      if (price.Price !== undefined) {
        if (typeof price.Price !== 'number' || price.Price < 0) {
          errors.push(`Invalid price at index ${index}: must be a positive number`);
        } else {
          const cents = Math.round(price.Price * 100);
          if (cents < VALIDATION.MIN_PRICE_CENTS || cents > VALIDATION.MAX_PRICE_CENTS) {
            errors.push(`Price at index ${index} out of valid range ($0.50 - $999,999.99)`);
          }
        }
      }

      if (price.Currency && !VALIDATION.ALLOWED_CURRENCIES.includes(price.Currency.toLowerCase())) {
        errors.push(`Invalid currency at index ${index}: ${price.Currency}`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
