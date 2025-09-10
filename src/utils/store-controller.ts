/**
 * Smart Controller Base - Extends your middleware pattern
 * USAGE: Replace repetitive controller patterns with this factory
 *
 * Instead of writing the same CRUD logic everywhere:
 * export default createStoreController('api::customer.customer', ({ strapi }) => ({
 *   // Your custom methods here
 *   async searchCustomers(ctx) { ... }
 * }))
 */

import { factories } from '@strapi/strapi';
import { ResponseFormatter } from './response-formatter';

export const createStoreController = (uid: any, customMethods: any = {}) => {
  return factories.createCoreController(uid, ({ strapi }) => ({
    // Your CRUD with auto store-scoping
    async find(ctx: any) {
      const { storeId } = ctx.state;

      const existingFilters = (ctx.query.filters as any) || {};
      ctx.query.filters = {
        ...existingFilters,
        store: { documentId: storeId }
      };

      return super.find(ctx);
    },

    async findOne(ctx: any) {
      const { documentId } = ctx.params;
      const { storeId } = ctx.state;

      try {
        const doc = await strapi.documents(uid as any).findOne({
          documentId,
          filters: { store: { documentId: storeId } } as any
        });

        if (!doc) {
          const resourceName = uid.split('::')[1];
          return ResponseFormatter.error(ctx, 'missing', resourceName);
        }
      } catch (error) {
        // Continue with super.findOne if direct check fails
      }

      return super.findOne(ctx);
    },

    async update(ctx: any) {
      const { documentId } = ctx.params;
      const { storeId } = ctx.state;

      try {
        const doc = await strapi.documents(uid as any).findOne({
          documentId,
          filters: { store: { documentId: storeId } } as any
        });

        if (!doc) {
          const resourceName = uid.split('::')[1];
          return ResponseFormatter.error(ctx, 'missing', resourceName);
        }
      } catch (error) {
        // Continue with super.update if direct check fails
      }

      return super.update(ctx);
    },

    async delete(ctx: any) {
      const { documentId } = ctx.params;
      const { storeId } = ctx.state;

      try {
        const doc = await strapi.documents(uid as any).findOne({
          documentId,
          filters: { store: { documentId: storeId } } as any
        });

        if (!doc) {
          const resourceName = uid.split('::')[1];
          return ResponseFormatter.error(ctx, 'missing', resourceName);
        }
      } catch (error) {
        // Continue with super.delete if direct check fails
      }

      return super.delete(ctx);
    },

    // Merge custom methods from the consumer
    ...(typeof customMethods === 'function'
        ? customMethods({ strapi, ResponseFormatter })
        : customMethods)
  }));
};
