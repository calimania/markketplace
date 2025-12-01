/**
 * Extension Service
 *
 * Utilities for managing integrations via the common.extension component.
 * Supports external services like Odoo, custom webhooks, and API integrations.
 */

export interface Extension {
  key: string;           // Format: "namespace:service" (e.g., "markket:odoo", "sync:shopify")
  key_sec?: string;      // Secret key/API key (encrypted at rest)
  url?: string;          // Service endpoint URL
  data?: any;            // Arbitrary JSON configuration data
  active?: boolean;      // Whether this extension is currently active
  last_sync?: string;    // ISO datetime of last sync operation
}

export interface ExtensionFilter {
  key?: string;
  namespace?: string;    // First part of key (e.g., "markket" from "markket:odoo")
  service?: string;      // Second part of key (e.g., "odoo" from "markket:odoo")
  active?: boolean;
}

/**
 * Validate extension key format
 */
export function isValidExtensionKey(key: string): boolean {
  return /^[a-z0-9]+:[a-z0-9-]+$/.test(key);
}

/**
 * Parse extension key into namespace and service
 */
export function parseExtensionKey(key: string): { namespace: string; service: string } | null {
  if (!isValidExtensionKey(key)) {
    return null;
  }

  const [namespace, service] = key.split(':');
  return { namespace, service };
}

/**
 * Find extension in array by key
 */
export function findExtension(extensions: Extension[], key: string): Extension | null {
  if (!extensions || !Array.isArray(extensions)) {
    return null;
  }

  return extensions.find(ext => ext.key === key) || null;
}

/**
 * Filter extensions by criteria
 */
export function filterExtensions(extensions: Extension[], filter: ExtensionFilter): Extension[] {
  if (!extensions || !Array.isArray(extensions)) {
    return [];
  }

  return extensions.filter(ext => {
    // Filter by exact key match
    if (filter.key && ext.key !== filter.key) {
      return false;
    }

    // Filter by namespace
    if (filter.namespace) {
      const parsed = parseExtensionKey(ext.key);
      if (!parsed || parsed.namespace !== filter.namespace) {
        return false;
      }
    }

    // Filter by service
    if (filter.service) {
      const parsed = parseExtensionKey(ext.key);
      if (!parsed || parsed.service !== filter.service) {
        return false;
      }
    }

    // Filter by active status
    if (filter.active !== undefined && ext.active !== filter.active) {
      return false;
    }

    return true;
  });
}

/**
 * Create or update extension in array
 */
export function upsertExtension(
  extensions: Extension[],
  newExtension: Extension
): Extension[] {
  if (!isValidExtensionKey(newExtension.key)) {
    throw new Error(`Invalid extension key format: ${newExtension.key}. Use format "namespace:service"`);
  }

  const existingExtensions = extensions || [];
  const existingIndex = existingExtensions.findIndex(ext => ext.key === newExtension.key);

  if (existingIndex >= 0) {
    // Update existing
    const updated = [...existingExtensions];
    updated[existingIndex] = { ...updated[existingIndex], ...newExtension };
    return updated;
  } else {
    // Add new
    return [...existingExtensions, newExtension];
  }
}

/**
 * Remove extension from array by key
 */
export function removeExtension(extensions: Extension[], key: string): Extension[] {
  if (!extensions || !Array.isArray(extensions)) {
    return [];
  }

  return extensions.filter(ext => ext.key !== key);
}

/**
 * Update last_sync timestamp for an extension
 */
export function updateLastSync(extensions: Extension[], key: string): Extension[] {
  const extension = findExtension(extensions, key);
  if (!extension) {
    console.warn(`[EXTENSIONS] Extension not found: ${key}`);
    return extensions;
  }

  return upsertExtension(extensions, {
    ...extension,
    last_sync: new Date().toISOString()
  });
}

/**
 * Validate extension configuration
 */
export function validateExtension(extension: Extension): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!extension.key) {
    errors.push('Extension key is required');
  } else if (!isValidExtensionKey(extension.key)) {
    errors.push('Extension key must be in format "namespace:service" (lowercase alphanumeric and hyphens only)');
  }

  if (extension.url && !isValidUrl(extension.url)) {
    errors.push('Extension URL must be a valid URL');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Simple URL validation
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get extension configuration data with type safety
 */
export function getExtensionData<T = any>(extension: Extension): T | null {
  if (!extension || !extension.data) {
    return null;
  }

  return extension.data as T;
}

/**
 * Example usage patterns:
 *
 * // Create Odoo integration
 * const odooExtension: Extension = {
 *   key: 'markket:odoo',
 *   key_sec: 'your-api-key',
 *   url: 'https://your-odoo-instance.com/api',
 *   data: {
 *     database: 'production',
 *     username: 'admin',
 *     sync_products: true,
 *     sync_orders: true
 *   },
 *   active: true
 * };
 *
 * // Add to store
 * const updatedExtensions = upsertExtension(store.extensions, odooExtension);
 * await strapi.documents('api::store.store').update({
 *   documentId: store.documentId,
 *   data: { extensions: updatedExtensions }
 * });
 *
 * // Find specific extension
 * const odoo = findExtension(store.extensions, 'markket:odoo');
 * if (odoo && odoo.active) {
 *   // Perform sync
 *   const config = getExtensionData(odoo);
 *   await syncWithOdoo(odoo.url, odoo.key_sec, config);
 *
 *   // Update last sync
 *   const updated = updateLastSync(store.extensions, 'markket:odoo');
 *   await strapi.documents('api::store.store').update({
 *     documentId: store.documentId,
 *     data: { extensions: updated }
 *   });
 * }
 *
 * // Filter by namespace
 * const markketExtensions = filterExtensions(store.extensions, { namespace: 'markket' });
 *
 * // Get all active extensions
 * const activeExtensions = filterExtensions(store.extensions, { active: true });
 */
