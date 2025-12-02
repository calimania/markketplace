/**
 * Middleware to auto-encrypt sensitive fields before saving
 *
 * Current use cases:
 * - Extension credentials (api_key, password, token fields)
 *
 * Future expansion:
 * - Any content type can have encrypted fields
 * - Just add field names to ENCRYPTED_FIELDS map
 * - Works for JSON fields, component fields, or direct fields
 *
 * Admin experience:
 * - Admins write plain text values in admin panel
 * - Auto-encrypted on save before hitting database
 * - Encrypted values shown when viewing (can't reverse them)
 * - Only server-side handlers can decrypt
 */

import { encryptCredentials } from '../services/encryption';

/**
 * Define which fields should be auto-encrypted per content type
 */
const ENCRYPTED_FIELDS = {
  '*': {
    'extensions': 'component'
  },
};

export function registerMiddleware({ strapi }: { strapi: any }) {
  console.log('[ENCRYPT_MIDDLEWARE] Registering auto-encryption middleware');

  strapi.documents.use(async (context: any, next: any) => {
    if (!['create', 'update'].includes(context.action)) {
      return next();
    }

    // Admin panel puts data in context.params.data, API puts it in context.data
    const dataToCheck = context.params?.data || context.data;

    console.log('[ENCRYPT_MIDDLEWARE] Checking data location', {
      action: context.action,
      uid: context.uid,
      dataLocation: context.params?.data ? 'params.data' : 'data',
      hasExtensions: !!dataToCheck?.extensions,
      extensionsCount: dataToCheck?.extensions?.length || 0
    });

    if (!dataToCheck?.extensions?.length) {
      return next();
    }

    console.log('[ENCRYPT_MIDDLEWARE] Processing extensions', {
      count: dataToCheck.extensions.length
    });

    // Encrypt in place
    dataToCheck.extensions = dataToCheck.extensions.map((ext: any, index: number) => {
      if (!ext.credentials) return ext;

      // Handle credentials as JSON string (admin panel bug)
      let credsObject = ext.credentials;
      if (typeof ext.credentials === 'string') {
        try {
          credsObject = JSON.parse(ext.credentials);
          console.log(`[ENCRYPT_MIDDLEWARE] Extension ${index}: Parsed JSON string credentials`);
        } catch (error) {
          console.error(`[ENCRYPT_MIDDLEWARE] Extension ${index}: Failed to parse credentials JSON`);
          return ext;
        }
      }

      // Verify it's actually an object with credential fields
      if (typeof credsObject !== 'object' || Array.isArray(credsObject)) {
        console.warn(`[ENCRYPT_MIDDLEWARE] Extension ${index}: Credentials is not an object`, {
          type: typeof credsObject,
          isArray: Array.isArray(credsObject)
        });
        return ext;
      }

      const beforeEncrypt = JSON.stringify(credsObject);
      const encryptedCreds = encryptCredentials(credsObject);
      const afterEncrypt = JSON.stringify(encryptedCreds);

      console.log(`[ENCRYPT_MIDDLEWARE] Extension ${index}:`, {
        key: ext.key,
        fields: Object.keys(credsObject),
        wasModified: beforeEncrypt !== afterEncrypt
      });

      return { ...ext, credentials: encryptedCreds };
    });

    return next();
  });
}