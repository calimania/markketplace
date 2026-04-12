import { checkStoreAccess, ERRORS, requireUser, sanitizeStore } from '../../../services/api-auth';

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
  'active',
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

function pickAllowedFields(input: Record<string, any>, allowedFields: string[]): Record<string, any> {
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
    const data = pickAllowedFields(requestData, STORE_MUTABLE_FIELDS);

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
    const data = pickAllowedFields(requestData, STORE_MUTABLE_FIELDS);

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
};
