/**
 * Tienda Content Helpers
 * Shared utilities for all content handlers
 */

import type { ContentTypeConfig } from './content-registry';

/**
 * Truncate text to a max length, preferring a clean break at sentence-ending
 * punctuation (. ! ?) or a word boundary, then appending ellipsis when cut.
 * Targets Google's ~160-char metaDescription recommendation.
 */
export function smartTruncate(text: string, max: number = 160): string {
  const str = String(text || '').replace(/\s+/g, ' ').trim();
  if (str.length <= max) return str;

  const window = str.slice(0, max);

  // Prefer last sentence-ending punctuation within the window
  const sentenceEnd = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  if (sentenceEnd > max * 0.5) {
    return str.slice(0, sentenceEnd + 1).trim();
  }

  // Fall back to last word boundary
  const wordEnd = window.lastIndexOf(' ');
  if (wordEnd > max * 0.5) {
    return window.slice(0, wordEnd).trim() + '…';
  }

  return window.trim() + '…';
}

function slugifyValue(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 96);
}

/**
 * Validate and normalise a store slug submitted by a client.
 * Returns { ok, slug } on success or { ok: false, error } with a
 * human-readable message the API can send directly to the client.
 *
 * Rules:
 *  - Normalised to lowercase, accents stripped, spaces → hyphens
 *  - Only a-z 0-9 and hyphens allowed after normalisation
 *  - 2–96 characters
 *  - Cannot start or end with a hyphen
 */
export function validateAndNormalizeSlug(
  raw: string,
): { ok: true; slug: string } | { ok: false; error: string } {
  const normalised = slugifyValue(String(raw || '').trim());

  if (!normalised) {
    return { ok: false, error: 'slug is required and must contain at least one letter or number' };
  }
  if (normalised.length < 2) {
    return { ok: false, error: 'slug must be at least 2 characters' };
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalised)) {
    return { ok: false, error: 'slug may only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen' };
  }

  return { ok: true, slug: normalised };
}

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

  // Auto-fill metaDescription from content field (smart truncation ~160 chars)
  if (!data.SEO.metaDescription && config.contentField && data[config.contentField]) {
    let content = data[config.contentField];
    // Handle blocks format (Strapi RichText)
    if (Array.isArray(content) && content[0]?.children) {
      content = content.map((block: any) => block.children?.map((c: any) => c.text).join('')).join(' ');
    } else if (typeof content !== 'string') {
      content = String(content);
    }
    data.SEO.metaDescription = smartTruncate(content, 160);
  }

  return data;
}

export function ensureGeneratedSlug(data: any, config: ContentTypeConfig, existingItem?: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const nextData = { ...data };
  const currentSlug = typeof nextData.slug === 'string' ? nextData.slug.trim() : '';
  const existingSlug = typeof existingItem?.slug === 'string' ? existingItem.slug.trim() : '';

  if (currentSlug || existingSlug) {
    return nextData;
  }

  const titleValue = nextData?.[config.titleField] ?? existingItem?.[config.titleField];
  if (!titleValue) {
    return nextData;
  }

  const generatedSlug = slugifyValue(String(titleValue));
  if (!generatedSlug) {
    return nextData;
  }

  nextData.slug = generatedSlug;
  return nextData;
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
 * Sanitize relation, media, and component fields before sending to Strapi Document Service.
 *
 * When a client does GET → edit → PUT, populated relation/media objects are sent back
 * verbatim. Strapi v5 rejects full objects for relation fields and stale component ids.
 *
 * - mediaFields: reduce to { id } only (or null)
 * - relationFields: convert populated object to { connect: [{ documentId }] } (or null)
 * - componentFields (repeatable): strip `id` from each entry to avoid stale-entry conflicts
 */
export function sanitizePayloadForUpdate(data: any, config: ContentTypeConfig): any {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };

  // Media fields — keep only the id
  for (const field of config.mediaFields || []) {
    if (!Object.prototype.hasOwnProperty.call(out, field)) continue;
    const val = out[field];
    if (val === null || val === undefined) {
      out[field] = null;
    } else if (Array.isArray(val)) {
      // Multiple media
      out[field] = val
        .filter((v: any) => v?.id || v?.documentId)
        .map((v: any) => ({ id: v.id ?? v.documentId }));
    } else if (typeof val === 'object' && (val.id || val.documentId)) {
      out[field] = { id: val.id ?? val.documentId };
    }
    // If it's already a number/string id, leave it
  }

  // Relation fields — convert populated objects to connect syntax
  for (const field of config.relationFields || []) {
    if (!Object.prototype.hasOwnProperty.call(out, field)) continue;
    const val = out[field];
    if (val === null || val === undefined) {
      out[field] = null;
    } else if (Array.isArray(val)) {
      // manyToMany — convert each to documentId
      const ids = val
        .filter((v: any) => v?.documentId || v?.id)
        .map((v: any) => ({ documentId: v.documentId ?? String(v.id) }));
      out[field] = { connect: ids };
    } else if (typeof val === 'object' && (val.documentId || val.id)) {
      // manyToOne — convert to connect
      out[field] = { connect: [{ documentId: val.documentId ?? String(val.id) }] };
    }
    // Already a connect/disconnect/set object or plain id — leave it
  }

  // Repeatable component fields — strip `id` to avoid stale entry conflicts in Strapi v5
  for (const field of config.componentFields || []) {
    if (!Object.prototype.hasOwnProperty.call(out, field)) continue;
    const val = out[field];
    if (Array.isArray(val)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      out[field] = val.map(({ id: _id, ...rest }: any) => rest);
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
