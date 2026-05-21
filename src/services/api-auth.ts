/**
 * Shared API auth/access helpers for protected actor-scoped endpoints.
 */

const RESOURCE_UNAVAILABLE_MESSAGE = 'Resource unavailable';

export function requireUser(ctx: any): any | null {
  const user = ctx.state?.user;

  if (!user?.id) {
    ctx.unauthorized('Authentication required');
    return null;
  }

  return user;
}

async function findStoreByRef(strapi: any, ref: string): Promise<any | null> {
  const normalizedRef = String(ref || '').trim();
  if (!normalizedRef) {
    return null;
  }

  const byDocumentId = await strapi.documents('api::store.store').findOne({
    documentId: normalizedRef,
    populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'],
  }) as any;

  if (byDocumentId) {
    return byDocumentId;
  }

  const bySlug = await strapi.documents('api::store.store').findMany({
    filters: { slug: normalizedRef },
    populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'],
    limit: 1,
  }) as any[];

  return bySlug && bySlug.length > 0 ? bySlug[0] : null;
}

export async function checkStoreAccess(
  strapi: any,
  userId: string | number,
  storeRef: string,
): Promise<{ hasAccess: boolean; store: any | null; isAdmin: boolean; membership: any | null; isOwner: boolean }> {
  const store = await findStoreByRef(strapi, storeRef);

  if (!store) {
    return { hasAccess: false, store: null, isAdmin: false, membership: null, isOwner: false };
  }

  const userIdNum = Number(userId);
  const userIdStr = String(userId);

  const storeMemberships = await strapi.documents('api::store-membership.store-membership').findMany({
    filters: {
      store: { documentId: store.documentId },
      user: { id: userIdNum },
      status: 'active',
    } as any,
    limit: 1,
  }) as any[];

  const membership = storeMemberships?.[0] || null;

  const isStoreUser = Array.isArray(store.users)
    ? store.users.some((user: any) => Number(user?.id) === userIdNum)
    : false;

  const isAdminUser = Array.isArray(store.admin_users)
    ? store.admin_users.some((admin: any) => String(admin?.id) === userIdStr)
    : false;

  const isOwner = Number(store.owner?.id) === userIdNum || membership?.role === 'owner';

  return {
    hasAccess: Boolean(membership) || isStoreUser || isAdminUser,
    store,
    isAdmin: isAdminUser,
    membership,
    isOwner,
  };
}

export function sanitizeStore(store: any): any {
  if (!store) {
    return null;
  }

  const { users, admin_users, memberships, extensions, ...rest } = store;
  return rest;
}

export const ERRORS = {
  RESOURCE_UNAVAILABLE_MESSAGE,
  STORE_NOT_FOUND: RESOURCE_UNAVAILABLE_MESSAGE,
};
