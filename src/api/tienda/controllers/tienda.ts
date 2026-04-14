import { checkStoreAccess, ERRORS, requireUser, sanitizeStore } from '../../../services/api-auth';
import {
  verifyItemBelongsToStore,
  autoFillSEO,
  pickAllowedFields,
  sanitizePayloadForUpdate,
  buildStoreRelation,
  applyPagination,
  checkRateLimit,
  buildStoreFilter,
  sanitizeContentItem,
} from '../helpers';
import { resolveContentType, RATE_LIMIT_CONFIG } from '../content-registry';
import { getMediaFieldConfig, getMediaTargetConfig, getMediaTargetsForClient } from '../media-targets';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_PREFIXES = ['image/']; // 'video/', 'audio/'];
const ALLOWED_UPLOAD_MIME_EXACT = new Set([
  'application/pdf',
  'text/plain',
  'application/json',
]);

const STORE_MUTABLE_FIELDS = [
  'title',
  'slug',
  'Description',
  'Logo',
  'Cover',
  'Slides',
  'Favicon',
  'URLS',
  'SEO',
  'addresses',
];

function getRequestData(ctx: any): Record<string, any> {
  const body = ctx.request?.body;
  if (!body) {
    return {};
  }

  if (body.data && typeof body.data === 'object') {
    return body.data;
  }

  if (typeof body === 'object') {
    return body;
  }

  return {};
}

function pickStoreFields(input: Record<string, any>, allowedFields: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      out[field] = input[field];
    }
  }
  return out;
}

async function beforeActivities(_ctx: any, _action: string, _payload?: Record<string, any>): Promise<void> {
  // Reserved hook: rate-limit checks, token policies, and pre-webhook guards.
}

async function afterActivities(_ctx: any, _action: string, _result?: Record<string, any>): Promise<void> {
  // Reserved hook: alerting, audit trail, async webhooks, and usage tracking.
}

function normalizeUploadFiles(ctx: any): any[] {
  const files = ctx.request?.files;
  if (!files) {
    return [];
  }

  const candidates = [
    files.files,
    files.file,
    files.upload,
  ].filter(Boolean);

  if (candidates.length > 0) {
    const picked = candidates[0];
    return Array.isArray(picked) ? picked : [picked];
  }

  if (Array.isArray(files)) {
    return files;
  }

  return Object.values(files).flatMap((value: any) => (Array.isArray(value) ? value : [value]));
}

function isAllowedMime(mimeType: string): boolean {
  if (!mimeType) {
    return false;
  }

  if (ALLOWED_UPLOAD_MIME_EXACT.has(mimeType)) {
    return true;
  }

  return ALLOWED_UPLOAD_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
}

function parseJsonIfString(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeFileInfo(input: any, totalFiles: number): any[] {
  const parsed = parseJsonIfString(input);
  if (Array.isArray(parsed)) {
    return parsed.slice(0, totalFiles);
  }

  if (parsed && typeof parsed === 'object') {
    return [parsed];
  }

  return [];
}

function normalizeInputForContentType(input: Record<string, any>, config: any): Record<string, any> {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const normalized: Record<string, any> = { ...input };
  const mutableFields = Array.isArray(config?.mutableFields) ? config.mutableFields : [];

  if (mutableFields.length === 0) {
    return normalized;
  }

  const mutableFieldMap = new Map<string, string>();
  for (const field of mutableFields) {
    if (typeof field === 'string') {
      mutableFieldMap.set(field.toLowerCase(), field);
    }
  }

  for (const [key, value] of Object.entries(input)) {
    if (mutableFields.includes(key)) {
      continue;
    }

    const canonicalField = mutableFieldMap.get(String(key).toLowerCase());
    if (!canonicalField) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(normalized, canonicalField)) {
      normalized[canonicalField] = value;
    }
  }

  return normalized;
}

function ensureRequestId(ctx: any): string {
  const incomingRequestId = String(
    ctx.request?.headers?.['x-request-id'] ||
    ctx.request?.headers?.['x-correlation-id'] ||
    ''
  ).trim();

  const generatedRequestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const requestId = incomingRequestId || generatedRequestId;

  ctx.set('X-Request-Id', requestId);
  return requestId;
}

export default {
  async me(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    return ctx.send({
      ok: true,
      actor: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  },

  async stores(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    try {
      const storesFromUsers = await strapi.documents('api::store.store').findMany({
        filters: { users: { id: user.id } },
        populate: ['settings', 'users', 'admin_users'],
      }) as any[];

      const storesFromAdmins = await strapi.documents('api::store.store').findMany({
        filters: { admin_users: { id: user.id } },
        populate: ['settings', 'users', 'admin_users'],
      }) as any[];

      const uniqueByDocumentId = new Map<string, any>();
      for (const item of [...(storesFromUsers || []), ...(storesFromAdmins || [])]) {
        if (item?.documentId) {
          uniqueByDocumentId.set(item.documentId, sanitizeStore(item));
        }
      }

      return ctx.send({
        ok: true,
        data: Array.from(uniqueByDocumentId.values()),
      });
    } catch (error) {
      console.error('[TIENDA_STORES] List failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async createStore(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const requestData = getRequestData(ctx);
    const data = pickStoreFields(requestData, STORE_MUTABLE_FIELDS);

    if (!data.title || !data.slug) {
      return ctx.badRequest('title and slug are required');
    }

    try {
      await beforeActivities(ctx, 'store.create', data);

      const created = await strapi.documents('api::store.store').create({
        data: data as any,
        populate: ['settings', 'users', 'admin_users'],
      }) as any;

      const updated = await strapi.documents('api::store.store').update({
        documentId: created.documentId,
        data: {
          users: {
            connect: [user.id],
          },
        },
        populate: ['settings', 'users', 'admin_users'],
      }) as any;

      await strapi.documents('api::store.store').publish({
        documentId: created.documentId,
      });

      await afterActivities(ctx, 'store.create', { store: updated || created });

      return ctx.send({
        ok: true,
        store: sanitizeStore(updated || created),
      });
    } catch (error) {
      console.error('[TIENDA_STORE_CREATE] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async updateStore(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const requestData = getRequestData(ctx);
    const data = pickStoreFields(requestData, STORE_MUTABLE_FIELDS);

    if (Object.keys(data).length === 0) {
      return ctx.badRequest('No allowed fields provided');
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      await beforeActivities(ctx, 'store.update', data);

      const updated = await strapi.documents('api::store.store').update({
        documentId: access.store.documentId,
        data,
        populate: ['settings', 'users', 'admin_users'],
      }) as any;

      await strapi.documents('api::store.store').publish({
        documentId: access.store.documentId,
      });

      await afterActivities(ctx, 'store.update', { store: updated });

      return ctx.send({
        ok: true,
        store: sanitizeStore(updated),
      });
    } catch (error) {
      console.error('[TIENDA_STORE_UPDATE] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async store(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      return ctx.send({
        ok: true,
        actor: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        store: sanitizeStore(access.store),
      });
    } catch (error) {
      console.error('[TIENDA_STORE] Resolver failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async storeSettings(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      return ctx.send({
        ok: true,
        settings: access.store.settings || null,
      });
    } catch (error) {
      console.error('[TIENDA_STORE_SETTINGS_GET] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async updateStoreSettings(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const data = getRequestData(ctx);
    if (!data || typeof data !== 'object') {
      return ctx.badRequest('Invalid settings payload');
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      await beforeActivities(ctx, 'store.settings.update', data);

      let settings: any;
      let created = false;
      if (access.store.settings?.documentId) {
        settings = await strapi.documents('api::store.store-setting').update({
          documentId: access.store.settings.documentId,
          data,
        });
      } else {
        settings = await strapi.documents('api::store.store-setting').create({
          data: {
            ...data,
            store: access.store.documentId,
          },
        });
        created = true;
      }

      await afterActivities(ctx, 'store.settings.update', { settings });

      return ctx.send({
        ok: true,
        created,
        settings,
      });
    } catch (error) {
      console.error('[TIENDA_STORE_SETTINGS_UPDATE] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  /**
   * GET /api/tienda/tendero/:ref
   * Resolves store by documentId or slug and enforces actor-store ownership.
   */
  async tendero(ctx: any) {
    return this.store(ctx);
  },

  /**
   * GET /api/tienda/stores/:ref/media-targets
   * Returns attachable media targets/fields so clients can drive upload UI from backend config.
   */
  async mediaTargets(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const access = await checkStoreAccess(strapi, user.id, ref);
    if (!access?.store || !access?.hasAccess) {
      return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
    }

    return ctx.send({
      ok: true,
      store: {
        documentId: access.store.documentId,
        slug: access.store.slug,
      },
      targets: getMediaTargetsForClient(),
    });
  },

  /**
   * GET /api/tienda/stores/:ref/content/:contentType
   * List all content items of a specific type for a store with pagination and search
   */
  async listContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType } = ctx.params;

    try {
      const config = resolveContentType(contentType);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Rate limit: list operations are cheap, allow many
      const rateLimitKey = `list:${access.store.documentId}:${contentType}`;
      const rateLimit = checkRateLimit(rateLimitKey, 300); // 300/min = 5/sec, very generous
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      const { skip, limit } = applyPagination(ctx);
      const query: any = {
        filters: buildStoreFilter(access.store.documentId, config),
        populate: config.defaultPopulate,
        skip,
        limit,
      };

      // Apply search if provided
      if (ctx.query.search) {
        const searchTerm = String(ctx.query.search).trim();
        if (searchTerm.length > 0) {
          const titleField = config.titleField;
          query.filters = {
            ...query.filters,
            $or: [
              { [titleField]: { $containsi: searchTerm } },
              { keywords: { $containsi: searchTerm } }, // Search tags/keywords too
              { description: { $containsi: searchTerm } },
            ],
          };
        }
      }

      // Apply status filter
      if (ctx.query.status && ['draft', 'published'].includes(ctx.query.status)) {
        query.status = ctx.query.status;
      }

      const items = await (strapi.documents as any)(config.uid).findMany(query);
      const count = await (strapi.documents as any)(config.uid).count({
        filters: query.filters,
      });

      return ctx.send({
        ok: true,
        data: (items || []).map(item => sanitizeContentItem(item, config)),
        pagination: {
          page: Math.floor(skip / limit) + 1,
          pageSize: limit,
          total: count,
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error(`[TIENDA_LIST_CONTENT] ${contentType} failed:`, error.message);
      if (error.message.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      return ctx.internalServerError('Request failed');
    }
  },

  /**
   * POST /api/tienda/stores/:ref/content/:contentType
   * Create a new content item in the store
   */
  async createContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType } = ctx.params;
    const rawInputData = getRequestData(ctx);
    const requestId = ensureRequestId(ctx);

    try {
      const config = resolveContentType(contentType);
      const inputData = normalizeInputForContentType(rawInputData, config);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Rate limit: creates are expensive
      const rateLimitKey = `create:${access.store.documentId}`;
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG.creatPerMin);
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      // Pick allowed fields only
      const createData = pickAllowedFields(inputData, config);

      // Sanitize media/relation/component fields
      const sanitizedCreateData = sanitizePayloadForUpdate(createData, config);

      // Auto-fill SEO if title/content fields are present
      const enrichedData = autoFillSEO(sanitizedCreateData, config);

      const creatorData = config.autoSetCreator
        ? { [config.autoSetCreator]: user.id }
        : {};

      // Add store relation
      const dataWithStore = {
        ...enrichedData,
        ...creatorData,
        ...buildStoreRelation(access.store.documentId, config),
      };

      // Create and optionally publish based on content type config
      let item: any;
      try {
        item = await (strapi.documents as any)(config.uid).create({
          data: dataWithStore,
          populate: config.defaultPopulate,
        });
      } catch (createError: any) {
        console.error(`[TIENDA_CREATE_CONTENT] Strapi create failed for ${contentType}:`, createError.message);
        if (createError.message?.includes('unique')) {
          return ctx.conflict(`A ${contentType} with that slug or identifier already exists. requestId=${requestId}`);
        }
        return ctx.internalServerError(`Failed to create ${contentType}: ${createError.message}. requestId=${requestId}`);
      }

      const createWarnings: string[] = [];

      // Auto-publish if requested
      if (inputData.publishNow && config.hasDraftAndPublish) {
        try {
          await (strapi.documents as any)(config.uid).publish({
            documentId: item.documentId,
          });
        } catch (publishError: any) {
          console.warn(`[TIENDA_CREATE_CONTENT] Publish failed after create for ${contentType}/${item.documentId}:`, publishError.message);
          createWarnings.push(`Item created as draft. Publish failed: ${publishError.message}`);
        }
      }

      await afterActivities(ctx, `content.${contentType}.create`, { item });

      return ctx.send({
        ok: true,
        requestId,
        data: sanitizeContentItem(item, config),
        ...(createWarnings.length > 0 ? { warnings: createWarnings } : {}),
      });
    } catch (error: any) {
      console.error(`[TIENDA_CREATE_CONTENT] Unexpected error for ${contentType}:`, error.message);
      if (error.message?.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      return ctx.internalServerError(`Unexpected error: ${error.message}. requestId=${requestId}`);
    }
  },

  /**
   * GET /api/tienda/stores/:ref/content/:contentType/:itemId
   * Get a single content item by ID
   */
  async getContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType, itemId } = ctx.params;

    try {
      const config = resolveContentType(contentType);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      const item = await (strapi.documents as any)(config.uid).findOne({
        documentId: itemId,
        populate: config.defaultPopulate,
      });

      if (!item) {
        return ctx.notFound('Content not found');
      }

      // Verify item belongs to store
      if (!verifyItemBelongsToStore(item, access.store.documentId, config)) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      return ctx.send({
        ok: true,
        data: sanitizeContentItem(item, config),
      });
    } catch (error) {
      console.error(`[TIENDA_GET_CONTENT] ${contentType} failed:`, error.message);
      if (error.message.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      return ctx.internalServerError('Request failed');
    }
  },

  /**
   * PUT /api/tienda/stores/:ref/content/:contentType/:itemId
   * Update a content item
   */
  async updateContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType, itemId } = ctx.params;
    const rawInputData = getRequestData(ctx);
    const requestId = ensureRequestId(ctx);
    const requestedLocale = typeof ctx.query?.locale === 'string'
      ? String(ctx.query.locale).trim()
      : (typeof rawInputData?.locale === 'string' ? String(rawInputData.locale).trim() : '');

    try {
      const config = resolveContentType(contentType);
      const inputData = normalizeInputForContentType(rawInputData, config);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Rate limit: updates
      const rateLimitKey = `update:${access.store.documentId}`;
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG.updatesPerMin);
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      // Fetch current item to verify ownership
      const item = await (strapi.documents as any)(config.uid).findOne({
        documentId: itemId,
        populate: config.defaultPopulate,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
      });

      if (!item) {
        return ctx.notFound('Content not found');
      }

      if (!verifyItemBelongsToStore(item, access.store.documentId, config)) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Pick allowed fields only
      const updateData = pickAllowedFields(inputData, config);

      if (Object.keys(updateData).length === 0) {
        const writableFields = (config.mutableFields || []).filter(
          field => !(config.readOnlyFields || []).includes(field)
        );

        return ctx.badRequest(
          `No allowed fields provided for "${contentType}". Allowed fields: ${writableFields.join(', ')}`
        );
      }

      // Sanitize media/relation/component fields so populated GET data can be PUT back directly
      const sanitizedData = sanitizePayloadForUpdate(updateData, config);

      // Auto-fill SEO if title/content fields are present
      const enrichedData = autoFillSEO(sanitizedData, config);

      let updated: any;
      try {
        updated = await (strapi.documents as any)(config.uid).update({
          documentId: itemId,
          data: enrichedData,
          populate: config.defaultPopulate,
          ...(requestedLocale ? { locale: requestedLocale } : {}),
        });
      } catch (updateError: any) {
        console.error(`[TIENDA_UPDATE_CONTENT] Strapi update failed for ${contentType}/${itemId}:`, updateError.message, updateError?.details || updateError?.cause || '');
        console.error(`[TIENDA_UPDATE_CONTENT] Failed payload keys:`, Object.keys(enrichedData));
        return ctx.internalServerError(`Failed to save changes: ${updateError.message}. requestId=${requestId}`);
      }

      const warnings: string[] = [];

      // Always republish unless client explicitly requests draft-only save.
      // Note: Strapi v5 findOne returns draft by default (no publishedAt on draft),
      // so we cannot rely on item.publishedAt to detect published state.
      const shouldRepublish = Boolean(
        config.hasDraftAndPublish &&
        !inputData.unpublishNow &&
        !inputData.saveAsDraft
      );

      if (shouldRepublish || inputData.publishNow) {
        try {
          await (strapi.documents as any)(config.uid).publish({
            documentId: itemId,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (publishError: any) {
          console.warn(`[TIENDA_UPDATE_CONTENT] Publish failed after save for ${contentType}/${itemId}:`, publishError.message);
          warnings.push(`Content saved as draft. Publish failed: ${publishError.message}`);
        }
      }

      if (inputData.unpublishNow && config.hasDraftAndPublish) {
        try {
          await (strapi.documents as any)(config.uid).unpublish({
            documentId: itemId,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (unpublishError: any) {
          console.warn(`[TIENDA_UPDATE_CONTENT] Unpublish failed for ${contentType}/${itemId}:`, unpublishError.message);
          warnings.push(`Unpublish failed: ${unpublishError.message}`);
        }
      }

      // Fetch the published version for the response so the client sees
      // the final persisted state (not the intermediate draft object from .update()).
      const fetchStatus = (shouldRepublish && warnings.length === 0) ? 'published' : undefined;
      const responseItem = await (strapi.documents as any)(config.uid).findOne({
        documentId: itemId,
        populate: config.defaultPopulate,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
        ...(fetchStatus ? { status: fetchStatus } : {}),
      }) || updated;

      if (!responseItem) {
        console.error(`[TIENDA_UPDATE_CONTENT] No item returned after update for ${contentType}/${itemId}`);
        return ctx.internalServerError(`Content was saved but could not be retrieved. Check Strapi logs. requestId=${requestId}`);
      }

      console.log(`[TIENDA_UPDATE_CONTENT] Saved ${contentType}/${itemId}`, {
        fields: Object.keys(updateData),
        published: shouldRepublish && warnings.length === 0,
        locale: requestedLocale || 'default',
      });

      await afterActivities(ctx, `content.${contentType}.update`, { item: responseItem });

      return ctx.send({
        ok: true,
        requestId,
        data: sanitizeContentItem(responseItem, config),
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    } catch (error: any) {
      console.error(`[TIENDA_UPDATE_CONTENT] Unexpected error for ${contentType}/${itemId}:`, error.message);
      if (error.message?.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      if (error.message?.includes('Not Found') || error.message?.includes('not found')) {
        return ctx.notFound(`Content item not found: ${itemId}`);
      }
      return ctx.internalServerError(`Unexpected error: ${error.message}. requestId=${requestId}`);
    }
  },

  /**
   * DELETE /api/tienda/stores/:ref/content/:contentType/:itemId
   * Delete a content item (unpublish + delete)
   */
  async deleteContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType, itemId } = ctx.params;
    const requestId = ensureRequestId(ctx);
    const hardDelete = String(ctx.query?.hardDelete || '').toLowerCase() === 'true';
    const requestedLocale = typeof ctx.query?.locale === 'string'
      ? String(ctx.query.locale).trim()
      : '';

    try {
      const config = resolveContentType(contentType);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Rate limit: deletes are destructive, very strict
      const rateLimitKey = `delete:${access.store.documentId}`;
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG.deletesPerMin);
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      // Fetch item to verify ownership
      const item = await (strapi.documents as any)(config.uid).findOne({
        documentId: itemId,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
      });

      if (!item) {
        return ctx.notFound('Content not found');
      }

      if (!verifyItemBelongsToStore(item, access.store.documentId, config)) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Soft-delete by default for draft/publish content: unpublish only.
      if (config.hasDraftAndPublish && !hardDelete) {
        try {
          await (strapi.documents as any)(config.uid).unpublish({
            documentId: itemId,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (unpublishError: any) {
          console.error(`[TIENDA_DELETE_CONTENT] Unpublish failed for ${contentType}/${itemId}:`, unpublishError.message);
          return ctx.internalServerError(`Failed to unpublish: ${unpublishError.message}. requestId=${requestId}`);
        }

        await afterActivities(ctx, `content.${contentType}.unpublish`, { itemId, locale: requestedLocale || null });

        return ctx.send({
          ok: true,
          requestId,
          softDeleted: true,
          message: 'Content unpublished successfully',
        });
      }

      // Hard-delete path (explicit for draft/publish types, default for non draft/publish)
      if (config.hasDraftAndPublish) {
        try {
          await (strapi.documents as any)(config.uid).unpublish({
            documentId: itemId,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (err) {
          // Already unpublished, continue to delete
        }
      }

      try {
        await (strapi.documents as any)(config.uid).delete({
          documentId: itemId,
          ...(requestedLocale ? { locale: requestedLocale } : {}),
        });
      } catch (deleteError: any) {
        console.error(`[TIENDA_DELETE_CONTENT] Hard delete failed for ${contentType}/${itemId}:`, deleteError.message);
        return ctx.internalServerError(`Failed to delete: ${deleteError.message}. requestId=${requestId}`);
      }

      await afterActivities(ctx, `content.${contentType}.delete`, { itemId });

      return ctx.send({
        ok: true,
        requestId,
        message: 'Content deleted successfully',
      });
    } catch (error: any) {
      console.error(`[TIENDA_DELETE_CONTENT] Unexpected error for ${contentType}/${itemId}:`, error.message);
      if (error.message?.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      return ctx.internalServerError(`Unexpected error: ${error.message}. requestId=${requestId}`);
    }
  },

  /**
   * POST /api/tienda/stores/:ref/upload
   * Upload one or more files for a store through Strapi Upload plugin.
   */
  async uploadStoreMedia(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    const requestId = ensureRequestId(ctx);
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const badUploadRequest = (message: string, details?: Record<string, any>) => {
      console.warn('[TIENDA_UPLOAD] Bad request', {
        requestId,
        ref,
        ...(details || {}),
      });
      return ctx.badRequest(`${message}. requestId=${requestId}`);
    };

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      const rateLimitKey = `upload:${access.store.documentId}`;
      const rateLimit = checkRateLimit(rateLimitKey, 120);
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      const normalizedFiles = normalizeUploadFiles(ctx);
      if (normalizedFiles.length === 0) {
        return badUploadRequest('No files provided. Use multipart/form-data with field "files" or "file"', {
          bodyKeys: Object.keys(ctx.request?.body || {}),
          fileKeys: Object.keys(ctx.request?.files || {}),
        });
      }

      if (normalizedFiles.length > 10) {
        return badUploadRequest('Maximum 10 files per request', { fileCount: normalizedFiles.length });
      }

      for (const file of normalizedFiles) {
        const mimeType = String(file?.mimetype || file?.type || '');
        const size = Number(file?.size || 0);

        if (!isAllowedMime(mimeType)) {
          return badUploadRequest(`Unsupported file type: ${mimeType || 'unknown'}`, {
            fileName: file?.name || file?.originalFilename || 'file',
            mimeType,
          });
        }

        if (size <= 0 || size > MAX_UPLOAD_BYTES) {
          return badUploadRequest(
            `Invalid file size for ${file?.name || file?.originalFilename || 'file'}. Max is ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`,
            { fileName: file?.name || file?.originalFilename || 'file', size, maxSize: MAX_UPLOAD_BYTES }
          );
        }

        // Prefix filenames with store slug to keep uploads easy to identify by store.
        const originalName = String(file?.name || file?.originalFilename || 'file');
        const cleanName = originalName.replace(/\s+/g, '-');
        file.name = `${access.store.slug || access.store.documentId}-${Date.now()}-${cleanName}`;
      }

      const body = ctx.request?.body || {};
      const parsedFileInfo = normalizeFileInfo(body.fileInfo, normalizedFiles.length);

      const fileInfo = normalizedFiles.map((file: any, index: number) => {
        const metaFromArray = parsedFileInfo[index] && typeof parsedFileInfo[index] === 'object'
          ? parsedFileInfo[index]
          : {};

        const fallbackAlt = `${access.store.title || access.store.slug || 'store'} upload`;

        return {
          alternativeText: String(
            metaFromArray.alternativeText ||
            metaFromArray.altText ||
            body.alternativeText ||
            body.altText ||
            fallbackAlt,
          ),
          caption: String(metaFromArray.caption || body.caption || ''),
          name: String(metaFromArray.name || file.name),
        };
      });

      const uploadService = strapi.plugin('upload').service('upload');
      const uploaded = await uploadService.upload({
        data: {
          fileInfo,
        },
        files: normalizedFiles,
      });

      // Optional auto-attach to a content record media field.
      const attach = parseJsonIfString(body.attach);
      let attachmentResult: any = null;
      if (attach && typeof attach === 'object') {
        const attachContentType = String(attach.contentType || '').trim();
        const attachItemId = String(attach.itemId || '').trim();
        const attachField = String(attach.field || '').trim();
        const attachMode = String(attach.mode || 'replace').trim();

        if (!attachContentType || !attachField) {
          return badUploadRequest('Invalid attach payload. Required: contentType and field', { attach });
        }

        if (attachContentType !== 'store' && !attachItemId) {
          return badUploadRequest('Invalid attach payload. itemId is required for non-store targets', {
            attachContentType,
            attachField,
            attachMode,
          });
        }

        const targetConfig = getMediaTargetConfig(attachContentType);
        const fieldConfig = getMediaFieldConfig(attachContentType, attachField);
        if (!targetConfig || !fieldConfig) {
          return badUploadRequest(`Unsupported attach field "${attachField}" for type "${attachContentType}"`, {
            attachContentType,
            attachField,
          });
        }

        const fieldMode = fieldConfig.mode;

        if (fieldMode === 'single' && uploaded.length > 1) {
          return badUploadRequest(`Field "${attachField}" accepts a single file. Upload one file only`, {
            attachField,
            uploadedCount: uploaded.length,
          });
        }

        if (fieldMode === 'single' && attachMode === 'append') {
          return badUploadRequest('Mode "append" is only valid for multi-file fields', {
            attachField,
            attachMode,
            fieldMode,
          });
        }

        const targetUid = targetConfig.uid;
        const targetDocumentId = attachContentType === 'store'
          ? (attachItemId || access.store.documentId)
          : attachItemId;
        const [rootField, nestedField] = attachField.split('.');
        const effectiveField = nestedField ? rootField : attachField;

        if (attachContentType === 'store' && targetDocumentId !== access.store.documentId) {
          return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
        }

        const targetItem = await (strapi.documents as any)(targetUid).findOne({
          documentId: targetDocumentId,
          populate: attachContentType === 'store'
            ? [effectiveField]
            : [resolveContentType(attachContentType).storeField, effectiveField],
        });

        if (!targetItem) {
          return ctx.notFound('Target content item not found');
        }

        if (attachContentType !== 'store') {
          const contentConfig = resolveContentType(attachContentType);
          if (!verifyItemBelongsToStore(targetItem, access.store.documentId, contentConfig)) {
            return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
          }
        }

        const uploadedIds = uploaded.map((item: any) => item.id).filter(Boolean);
        let nextValue: any;
        const currentFieldValue = nestedField
          ? targetItem?.[rootField]?.[nestedField]
          : targetItem?.[attachField];

        if (fieldMode === 'single') {
          nextValue = uploadedIds[0] || null;
        } else {
          const existingIds = Array.isArray(currentFieldValue)
            ? currentFieldValue.map((item: any) => item?.id).filter(Boolean)
            : [];

          if (attachMode === 'append') {
            nextValue = Array.from(new Set([...existingIds, ...uploadedIds]));
          } else {
            nextValue = uploadedIds;
          }
        }

        const updateData = nestedField
          ? {
            [rootField]: {
              ...(targetItem?.[rootField] || {}),
              [nestedField]: nextValue,
            },
          }
          : {
            [attachField]: nextValue,
          };

        await (strapi.documents as any)(targetUid).update({
          documentId: targetDocumentId,
          data: updateData,
        });

        if (attachContentType === 'store') {
          await strapi.documents('api::store.store').publish({ documentId: targetDocumentId });
        } else {
          const contentConfig = resolveContentType(attachContentType);
          if (contentConfig.hasDraftAndPublish) {
            await (strapi.documents as any)(contentConfig.uid).publish({ documentId: targetDocumentId });
          }
        }

        attachmentResult = {
          contentType: attachContentType,
          itemId: targetDocumentId,
          field: attachField,
          mode: attachMode,
          uploadedCount: uploadedIds.length,
        };
      }

      return ctx.send({
        ok: true,
        requestId,
        data: (uploaded || []).map((item: any) => ({
          id: item.id,
          documentId: item.documentId,
          name: item.name,
          mime: item.mime,
          size: item.size,
          url: item.url,
          provider: item.provider,
          createdAt: item.createdAt,
        })),
        attachment: attachmentResult,
      });
    } catch (error: any) {
      const status = Number(error?.status || error?.statusCode || 500);
      const message = String(error?.message || 'Upload failed');

      console.error('[TIENDA_UPLOAD] Failed:', {
        requestId,
        status,
        message,
        details: error?.details || error?.cause || null,
      });

      if (status >= 400 && status < 500) {
        return ctx.badRequest(`${message}. requestId=${requestId}`);
      }

      return ctx.internalServerError(`Upload failed. requestId=${requestId}`);
    }
  },
};
