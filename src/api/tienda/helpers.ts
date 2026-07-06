/**
 * Tienda Content Helpers
 * Shared utilities for all content handlers
 */

import type { ContentTypeConfig } from './content-registry';
import { openRouterChatCompletion, parseJsonFromModelText } from '../../services/openrouter';

/**
 * Truncate text to a max length, preferring a clean break at paragraph/line breaks,
 * sentence-ending punctuation (. ! ?), or a word boundary, then appending ellipsis
 * when cut. Targets Google's ~160-char metaDescription recommendation.
 */
function truncateAtBoundary(str: string, max: number): string {
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

export function smartTruncate(text: string, max: number = 160): string {
  const plain = stripMarkdownAndRichText(text);
  const raw = String(plain || '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return '';

  const segments = raw
    .split(/\n+/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (segments.length > 1) {
    const fit = segments.find((segment) => segment.length <= max);
    if (fit) {
      return fit;
    }
  }

  const str = segments.join(' ');
  if (str.length <= max) return str;

  return truncateAtBoundary(str, max);
}

function stripMarkdownAndRichText(value: any): string {
  if (value == null) {
    return '';
  }

  let text = '';

  if (Array.isArray(value)) {
    // Strapi rich text blocks format
    text = value
      .map((block: any) => {
        if (Array.isArray(block?.children)) {
          return block.children.map((child: any) => String(child?.text || '')).join(' ');
        }
        return String(block?.text || '');
      })
      .join(' ');
  } else {
    text = String(value);
  }

  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/(^|\s)[#>*_~\-]{1,3}(?=\S)/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[|{}\[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateKeywordsFromText(
  title: string,
  content: string,
  maxKeywords = 8,
  maxLength = 255,
): string {
  const source = `${title || ''} ${content || ''}`.toLowerCase();
  const tokens = source
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3);

  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was', 'were', 'will',
    'our', 'about', 'into', 'have', 'has', 'had', 'not', 'but', 'all', 'new', 'now', 'can', 'its', 'out',
    'una', 'uno', 'para', 'con', 'del', 'las', 'los', 'que', 'por', 'una', 'como', 'desde', 'sobre',
  ]);

  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (stopWords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  const sortedKeywords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);

  const accepted: string[] = [];
  for (const keyword of sortedKeywords) {
    const candidate = accepted.length > 0
      ? `${accepted.join(', ')}, ${keyword}`
      : keyword;
    if (candidate.length > maxLength) {
      break;
    }
    accepted.push(keyword);
  }

  return accepted.join(', ');
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
export async function autoFillSEO(data: any, config: ContentTypeConfig): Promise<any> {
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

  const titleText = stripMarkdownAndRichText(data[config.titleField] || '');
  const contentText = stripMarkdownAndRichText(
    config.contentField ? data[config.contentField] : (data.description || data.Description || '')
  );

  // Auto-fill metaTitle/metaDescription, preferring OpenRouter generation with safe fallback.
  const summarySource = contentText || titleText;
  const needsMetaTitle = !data.SEO.metaTitle;
  const needsMetaDescription = !data.SEO.metaDescription;

  if ((needsMetaTitle || needsMetaDescription) && summarySource) {
    const fallbackMetaTitle = smartTruncate(titleText || summarySource, 60).replace(/…$/, '');
    const fallbackMetaDescription = smartTruncate(summarySource, 158);
    const shortSource = smartTruncate(summarySource, 220);

    let aiMetaTitle = '';
    let aiMetaDescription = '';

    const completion = await openRouterChatCompletion({
      model: process.env.OPEN_ROUTER_MODEL_SEO || process.env.OPEN_ROUTER_MODEL || 'openai/gpt-4o-mini',
      temperature: 0.4,
      maxTokens: 140,
      messages: [
        {
          role: 'system',
          content: 'Return JSON only. Generate concise SEO metadata. metaTitle max 60 chars, metaDescription max 158 chars, plain text only.',
        },
        {
          role: 'user',
          content: [
            'Generate SEO metaTitle and metaDescription for this content snippet.',
            `Title hint: ${titleText || 'N/A'}`,
            `Content snippet: ${shortSource}`,
            'JSON schema: {"metaTitle":"","metaDescription":""}',
          ].join('\n'),
        },
      ],
    });

    if (completion.ok) {
      const parsed = parseJsonFromModelText(completion.content);
      aiMetaTitle = smartTruncate(String(parsed?.metaTitle || '').trim(), 60).replace(/…$/, '');
      aiMetaDescription = smartTruncate(String(parsed?.metaDescription || '').trim(), 158);
    }

    if (needsMetaTitle) {
      data.SEO.metaTitle = aiMetaTitle || fallbackMetaTitle;
    }

    if (needsMetaDescription) {
      data.SEO.metaDescription = aiMetaDescription || fallbackMetaDescription;
    }
  }

  // Keep generic summary fields in sync when available and empty.
  if (Object.prototype.hasOwnProperty.call(data, 'description') && !data.description && contentText) {
    data.description = smartTruncate(contentText, 220);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'Description') && !data.Description && contentText) {
    data.Description = smartTruncate(contentText, 220);
  }

  // Generate keywords when empty.
  if (!data.SEO.metaKeywords) {
    const keywords = generateKeywordsFromText(titleText, contentText);
    if (keywords) {
      data.SEO.metaKeywords = keywords;
      if (Object.prototype.hasOwnProperty.call(data, 'keywords') && !data.keywords) {
        data.keywords = keywords;
      }
    }
  }

  return data;
}

const SEO_STRING_MAX_LENGTH = 255;
const SEO_LENGTH_FIELDS = [
  'metaTitle',
  'metaDescription',
  'metaKeywords',
  'metaUrl',
  'metaAuthor',
] as const;

/**
 * Validate SEO string field lengths against Strapi string/varchar constraints.
 * Returns null when valid, otherwise a user-facing message.
 */
export function validateSeoFieldLengths(data: any): string | null {
  if (!data || typeof data !== 'object' || !data.SEO || typeof data.SEO !== 'object') {
    return null;
  }

  for (const field of SEO_LENGTH_FIELDS) {
    const raw = data.SEO[field];
    if (raw == null) continue;
    const value = String(raw);
    if (value.length > SEO_STRING_MAX_LENGTH) {
      return `SEO.${field} is too long (${value.length}). Maximum length is ${SEO_STRING_MAX_LENGTH} characters.`;
    }
  }

  return null;
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
 * - mediaFields: reduce to scalar id/documentId values (or null)
 * - relationFields: convert populated object to { connect: [{ documentId }] } (or null)
 * - componentFields (repeatable): strip `id` from each entry to avoid stale-entry conflicts
 */
export function sanitizePayloadForUpdate(data: any, config: ContentTypeConfig): any {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };

  const toScalarRef = (value: any): string | number | null => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }

    if (typeof value !== 'object') {
      return null;
    }

    if (value.id !== undefined && value.id !== null) {
      return value.id;
    }

    if (value.documentId !== undefined && value.documentId !== null) {
      return String(value.documentId);
    }

    return null;
  };

  const buildRef = (value: any): { id: any } | { documentId: string } | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }

    if (value.id !== undefined && value.id !== null) {
      return { id: value.id };
    }

    if (value.documentId !== undefined && value.documentId !== null) {
      return { documentId: String(value.documentId) };
    }

    return null;
  };

  // Media fields — keep only the id
  for (const field of config.mediaFields || []) {
    if (!Object.prototype.hasOwnProperty.call(out, field)) continue;
    const val = out[field];
    if (val === null || val === undefined) {
      out[field] = null;
    } else if (Array.isArray(val)) {
      // Multiple media
      out[field] = val
        .map((v: any) => toScalarRef(v))
        .filter(Boolean);
    } else {
      out[field] = toScalarRef(val);
    }
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
        .map((v: any) => buildRef(v))
        .filter(Boolean);
      out[field] = { connect: ids };
    } else if (typeof val === 'object') {
      if (val.connect || val.set || val.disconnect) {
        continue;
      }
      const ref = buildRef(val);
      if (!ref) {
        continue;
      }
      // manyToOne — convert to connect
      out[field] = { connect: [ref] };
    } else if (typeof val === 'string' || typeof val === 'number') {
      out[field] = { connect: [{ id: val }] };
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

  // Nested media fields (dot-path, e.g. 'SEO.socialImage') — strip to scalar id/documentId.
  // Without this, a GET-then-PUT cycle sends back the full populated media object inside
  // the component, which Strapi v5 cannot interpret and silently clears the media.
  for (const dotPath of config.nestedMediaFields || []) {
    const dotIndex = dotPath.indexOf('.');
    if (dotIndex === -1) continue;
    const parent = dotPath.slice(0, dotIndex);
    const child = dotPath.slice(dotIndex + 1);
    if (!Object.prototype.hasOwnProperty.call(out, parent)) continue;
    const parentVal = out[parent];
    if (!parentVal || typeof parentVal !== 'object' || Array.isArray(parentVal)) continue;
    if (!Object.prototype.hasOwnProperty.call(parentVal, child)) continue;
    const val = parentVal[child];
    if (val === null || val === undefined) {
      parentVal[child] = null;
    } else {
      parentVal[child] = toScalarRef(val);
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
