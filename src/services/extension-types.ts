/**
 * Type definitions for the Extension system
 * Import these types for type-safe extension development
 */

/**
 * Core extension interface matching the common.extension component schema
 */
export interface Extension {
  /** Unique identifier in format "namespace:service" (e.g., "markket:odoo") */
  key: string;

  /** Encrypted secret/API key (stored as password type in Strapi) */
  key_sec?: string;

  /** Service endpoint URL */
  url?: string;

  /** Flexible JSON configuration data */
  data?: Record<string, any>;

  /** Whether this extension is currently active */
  active?: boolean;

  /** ISO datetime string of last sync operation */
  last_sync?: string;
}

/**
 * Filter criteria for querying extensions
 */
export interface ExtensionFilter {
  /** Exact key match */
  key?: string;

  /** Filter by namespace (first part of key before colon) */
  namespace?: string;

  /** Filter by service (second part of key after colon) */
  service?: string;

  /** Filter by active status */
  active?: boolean;
}

/**
 * Parsed extension key components
 */
export interface ParsedExtensionKey {
  /** Namespace (e.g., "markket" from "markket:odoo") */
  namespace: string;

  /** Service name (e.g., "odoo" from "markket:odoo") */
  service: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Array of error messages (empty if valid) */
  errors: string[];
}

// ============================================================================
// Common Extension Configurations
// ============================================================================

/**
 * Odoo ERP integration configuration
 */
export interface OdooExtensionData {
  /** Odoo database name */
  database: string;

  /** Integration username */
  username: string;

  /** Enable product synchronization */
  sync_products?: boolean;

  /** Enable order synchronization */
  sync_orders?: boolean;

  /** Sync interval in seconds */
  sync_interval?: number;

  /** Category ID mapping from Markket to Odoo */
  category_mapping?: Record<string, number>;

  /** Product template ID mapping */
  product_template_id_mapping?: Record<string, number>;
}

/**
 * Shopify integration configuration
 */
export interface ShopifyExtensionData {
  /** Shopify store name */
  store_name: string;

  /** Enable inventory synchronization */
  sync_inventory?: boolean;

  /** Enable collection synchronization */
  sync_collections?: boolean;

  /** Enable order synchronization */
  sync_orders?: boolean;

  /** Sync interval in seconds */
  sync_interval?: number;

  /** Location ID for inventory */
  location_id?: string;
}

/**
 * Generic webhook configuration
 */
export interface WebhookExtensionData {
  /** Events to trigger webhook on */
  events: string[];

  /** Number of retry attempts on failure */
  retry_attempts?: number;

  /** Delay between retries in milliseconds */
  retry_delay?: number;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Additional headers to include */
  headers?: Record<string, string>;

  /** Webhook signature algorithm */
  signature_algorithm?: 'sha256' | 'sha512';
}

/**
 * Analytics integration configuration
 */
export interface AnalyticsExtensionData {
  /** Project or property ID */
  project_id: string;

  /** Enable order tracking */
  track_orders?: boolean;

  /** Enable pageview tracking */
  track_pageviews?: boolean;

  /** Enable product view tracking */
  track_product_views?: boolean;

  /** Additional properties to track */
  custom_properties?: Record<string, any>;
}

/**
 * Shipping service configuration (e.g., Shippo, EasyPost)
 */
export interface ShippingExtensionData {
  /** Default carrier */
  default_carrier?: string;

  /** Enable address validation */
  address_validation?: boolean;

  /** Test mode flag */
  test_mode?: boolean;

  /** Default from address */
  from_address?: {
    name: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };

  /** Carrier account IDs */
  carrier_accounts?: Record<string, string>;
}

/**
 * CRM integration configuration (e.g., Salesforce, HubSpot)
 */
export interface CRMExtensionData {
  /** CRM instance URL */
  instance_url?: string;

  /** Enable contact sync */
  sync_contacts?: boolean;

  /** Enable deal/opportunity sync */
  sync_deals?: boolean;

  /** Field mapping from Markket to CRM */
  field_mapping?: Record<string, string>;

  /** Default owner/assignee ID */
  default_owner_id?: string;
}

/**
 * Custom ERP integration configuration
 */
export interface ERPExtensionData {
  /** Company or tenant ID */
  company_id: string;

  /** Enable inventory sync */
  sync_inventory?: boolean;

  /** Sync schedule (cron expression) */
  sync_schedule?: string;

  /** Custom field mappings */
  field_mappings?: Record<string, string>;

  /** Additional configuration */
  [key: string]: any;
}

// ============================================================================
// Typed Extension Helpers
// ============================================================================

/**
 * Type-safe extension creator
 */
export function createExtension<T = any>(
  key: string,
  config: {
    key_sec?: string;
    url?: string;
    data?: T;
    active?: boolean;
  }
): Extension {
  return {
    key,
    ...config,
    active: config.active ?? true
  };
}

/**
 * Type guard to check if extension has specific data type
 */
export function hasExtensionData<T>(
  extension: Extension,
  validator: (data: any) => data is T
): extension is Extension & { data: T } {
  return extension.data !== undefined && validator(extension.data);
}

// ============================================================================
// Example Validators
// ============================================================================

/**
 * Validate Odoo extension data
 */
export function isOdooExtensionData(data: any): data is OdooExtensionData {
  return (
    typeof data === 'object' &&
    typeof data.database === 'string' &&
    typeof data.username === 'string'
  );
}

/**
 * Validate webhook extension data
 */
export function isWebhookExtensionData(data: any): data is WebhookExtensionData {
  return (
    typeof data === 'object' &&
    Array.isArray(data.events) &&
    data.events.every((e: any) => typeof e === 'string')
  );
}

/**
 * Validate shipping extension data
 */
export function isShippingExtensionData(data: any): data is ShippingExtensionData {
  return typeof data === 'object';
}
