/**
 * product controller
 */

import { factories } from '@strapi/strapi'
import { syncProductWithStripe } from '../../../services/stripe-sync';
import { requireUser } from '../../../services/api-auth';

const coreController = factories.createCoreController('api::product.product', ({ strapi }) => ({
  /**
   * Override find to exclude extensions from client responses
   */
  async find(ctx) {
    const { data, meta } = await super.find(ctx);
    const sanitized = Array.isArray(data) ? data.map(item => {
      const { extensions, ...rest } = item;
      return rest;
    }) : data;
    return { data: sanitized, meta };
  },

  /**
   * Override findOne to exclude extensions from client responses
   */
  async findOne(ctx) {
    const { data, meta } = await super.findOne(ctx);
    if (data) {
      const { extensions, ...rest } = data;
      return { data: rest, meta };
    }
    return { data, meta };
  },

  async stripeSync(ctx) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const { documentId } = ctx.params;

    if (!documentId) {
      ctx.status = 400;
      ctx.body = { error: 'Missing documentId' };
      return;
    }

    const product = await strapi.documents('api::product.product').findOne({
      documentId,
      populate: ['PRICES', 'Thumbnail', 'Slides', 'stores', 'stores.users', 'stores.admin_users']
    });

    if (!product) {
      ctx.status = 404;
      ctx.body = { error: 'Product not found' };
      return;
    }

    const userIdNum = Number(user.id);
    const hasStoreAccess = Array.isArray(product.stores)
      ? product.stores.some((store: any) => {
        const isStoreUser = Array.isArray(store?.users)
          ? store.users.some((item: any) => Number(item?.id) === userIdNum)
          : false;
        const isAdminUser = Array.isArray(store?.admin_users)
          ? store.admin_users.some((item: any) => Number(item?.id) === userIdNum)
          : false;
        return isStoreUser || isAdminUser;
      })
      : false;

    if (!hasStoreAccess) {
      ctx.status = 403;
      ctx.body = { error: 'Resource unavailable' };
      return;
    }

    try {
      const syncResult = await syncProductWithStripe(product, { strapi, ctx });
      ctx.body = {
        success: true,
        message: 'Stripe sync completed.',
        result: syncResult,
      };
    } catch (error) {
      console.error('[product.controller][stripeSync] syncProductWithStripe failed', { documentId, message: error?.message });
      ctx.status = 500;
      ctx.body = {
        error: 'Stripe sync failed',
        details: process.env.NODE_ENV === 'development' ? (error?.message || String(error)) : undefined
      };
    }
  },
}));

export default coreController;
