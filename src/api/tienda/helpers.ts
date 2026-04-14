/**
 * Tienda Content Helpers
 * Shared utilities for all content handlers
 */

import type { ContentTypeConfig } from './content-registry';

/**
 * Verify an item belongs to the specified store based on the content type's store relation
 * Handles manyToOne, manyToMany, and oneToOne relations
 */
export function verifyItemBelongsToStore(
  item: any,
  storeDocumentId: string,
  config: ContentTypeConfig
): boolean {
  if (!item) return false;

  const storeData = item[config.storeField];
  if (!storeData) return false;

  if (config.storeRelationType === 'manyToMany') {
    // For manyToMany, stores is an array
    return Array.isArray(storeData) && storeData.some(s => s.documentId === storeDocumentId);
  } else if (config.storeRelationType === 'manyToOne' || config.storeRelationType === 'oneToOne') {
    // For manyToOne/oneToOne, store is a single object
    return storeData.documentId === storeDocumentId;
  }

  return false;
}

/**
 * Auto-fill SEO fields if they're empty
 * Non-destructive: only fills empty fields
 */
export function autoFillSEO(data: any, config: ContentTypeConfig): any {
  const hasSEOInput = Object.prototype.hasOwnProperty.call(data, 'SEO');
  const hasTitleInput = Object.prototype.hasOwnProperty.call(data, config.titleField);
  const hasContentInput = Boolean(config.contentField)
    ? Object.prototype.hasOwnProperty.call(data, config.contentField as string)
    : false;

  // Avoid writing SEO during partial updates that don't touch SEO/title/content.
  if (!hasSEOInput && !hasTitleInput && !hasContentInput) {
    return data;
  }

  if (!data.SEO || typeof data.SEO !== 'object') {
    data.SEO = {};
  }

  // Auto-fill metaTitle from title field
  if (!data.SEO.metaTitle && data[config.titleField]) {
    data.SEO.metaTitle = String(data[config.titleField]).slice(0, 60);
  }

  // Auto-fill metaDescription from content field (truncate to 160 chars)
  if (!data.SEO.metaDescription && config.contentField && data[config.contentField]) {
    let content = data[config.contentField];
    // Handle blocks format (Strapi RichText)
    if (Array.isArray(content) && content[0]?.children) {
      content = content.map((block: any) => block.children?.map((c: any) => c.text).join('')).join(' ');
    } else if (typeof content !== 'string') {
      content = String(content);
    }
    data.SEO.metaDescription = content.slice(0, 160).trim();
  }

  return data;
}

/**
 * Pick allowed fields from input, filtering out read-only fields
 */
export function pickAllowedFields(input: any, config: ContentTypeConfig): any {
  const out: any = {};

  for (const field of config.mutableFields) {
    if (config.readOnlyFields?.includes(field)) {
      continue; // Skip read-only fields
    }
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      out[field] = input[field];
    }
  }

  return out;
}

/**
 * Build store relation connect/disconnect based on relation type
 * Used when creating/updating items
 */
export function buildStoreRelation(storeDocumentId: string, config: ContentTypeConfig): any {
  if (config.storeRelationType === 'manyToMany') {
    return {
      [config.storeField]: { connect: [{ documentId: storeDocumentId }] },
    };
  } else if (config.storeRelationType === 'manyToOne') {
    return {
      [config.storeField]: storeDocumentId,
    };
  } else if (config.storeRelationType === 'oneToOne') {
    return {
      [config.storeField]: storeDocumentId,
    };
  }

  return {};
}

/**
 * Apply pagination query params
 */
export function applyPagination(ctx: any): { skip: number; limit: number } {
  const page = Math.max(1, parseInt(ctx.query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(ctx.query.pageSize || '25', 10)));

  return {
    skip: (page - 1) * pageSize,
    limit: pageSize,
  };
}

/**
 * Rate limit check (in-memory, simple per-store-action tracking)
 * In production, migrate to Redis for distributed rate limiting
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxPerMin: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = rateLimitMap.get(key);

  if (!bucket || now > bucket.resetAt) {
    // New bucket
    rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
    return { allowed: true, remaining: maxPerMin - 1, resetAt: now + 60000 };
  }

  if (bucket.count >= maxPerMin) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count++;
  return { allowed: true, remaining: maxPerMin - bucket.count, resetAt: bucket.resetAt };
}

/**
 * Build filter for store queries based on relation type
 */
export function buildStoreFilter(storeDocumentId: string, config: ContentTypeConfig): any {
  if (config.storeRelationType === 'manyToMany') {
    return { [config.storeField]: { documentId: storeDocumentId } };
  } else if (config.storeRelationType === 'manyToOne' || config.storeRelationType === 'oneToOne') {
    return { [config.storeField]: { documentId: storeDocumentId } };
  }

  return {};
}

/**
 * Sanitize response: remove internal fields
 */
export function sanitizeContentItem(item: any, config: ContentTypeConfig): any {
  if (!item) return null;

  const { extensions, creator, ...rest } = item; // Remove extensions (internal) and creator ID
  return rest;
}
