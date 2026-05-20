import { getVisibilityFlags } from '../api/store/services/dashboard';

const VISIBILITY_CONTENT_UIDS = new Set([
  'api::article.article',
  'api::page.page',
  'api::product.product',
  'api::event.event',
]);

async function resolveStoreIds(strapi: any, uid: string, documentId: string, result: any): Promise<string[]> {
  const ids = new Set<string>();

  const collect = (rel: any) => {
    if (Array.isArray(rel)) {
      rel.forEach((s: any) => { if (s?.documentId) ids.add(s.documentId); });
    } else if (rel?.documentId) {
      ids.add(rel.documentId);
    }
  };

  collect(result?.stores ?? result?.store);

  if (ids.size === 0 && documentId) {
    try {
      const doc = await strapi.documents(uid).findOne({
        documentId,
        populate: ['stores', 'store'],
        fields: ['id'],
      });
      collect(doc?.stores ?? doc?.store);
    } catch {
      // document may already be deleted; that's fine
    }
  }

  return Array.from(ids);
}

const pendingRefresh = new Set<string>();

function scheduleVisibilityRefresh(storeIds: string[]) {
  const fresh = storeIds.filter(id => !pendingRefresh.has(id));
  if (!fresh.length) return;

  fresh.forEach(id => pendingRefresh.add(id));

  setImmediate(async () => {
    for (const storeId of fresh) {
      try {
        await getVisibilityFlags(storeId);
      } catch (err: any) {
        console.warn('[visibility.refresh] failed', { storeId, message: err?.message });
      } finally {
        pendingRefresh.delete(storeId);
      }
    }
  });
}

export function registerStoreVisibilityMiddleware({ strapi }: { strapi: any }) {
  strapi.documents.use(async (context: any, next: any) => {
    if (!VISIBILITY_CONTENT_UIDS.has(context.uid)) {
      return next();
    }

    let preDeleteStoreIds: string[] = [];
    if (context.action === 'delete' && context.params?.documentId) {
      preDeleteStoreIds = await resolveStoreIds(strapi, context.uid, context.params.documentId, null);
    }

    const result = await next();

    if (['create', 'update', 'publish', 'unpublish'].includes(context.action)) {
      const storeIds = await resolveStoreIds(strapi, context.uid, result?.documentId, result);
      scheduleVisibilityRefresh(storeIds);
    } else if (context.action === 'delete' && preDeleteStoreIds.length) {
      scheduleVisibilityRefresh(preDeleteStoreIds);
    }

    return result;
  });
}
