/**
 * Store access middleware - handles store verification automatically
 */

import { checkUserStoreAccess } from '../api/store/controllers/store';

export default (options: { paramName?: string; queryName?: string } = {}) => {
  return async (ctx: any, next: any) => {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized();
    }

    // Check params first (/:storeId), then query (?storeId=...)
    const storeId = ctx.params[options.paramName || 'storeId'] ||
                   ctx.params.store_id ||
                   ctx.query[options.queryName || 'storeId'] ||
                   ctx.query.store_id;

    if (!storeId) {
      return ctx.badRequest('missing[store]');
    }

    const { hasAccess, store } = await checkUserStoreAccess(strapi, user.id, storeId);
    if (!hasAccess) {
      return ctx.forbidden('store');
    }

    // Inject into context for controllers
    ctx.state.store = store;
    ctx.state.storeId = storeId;

    await next();
  };
};
