/**
 * store controller
 */

import { factories } from '@strapi/strapi'

/** Checks for store record for user and user_admin records */
async function checkUserStoreAccess(strapi: any, userId: string, storeId: string) {

  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId,
    populate: ['users', 'admin_users', 'settings'],
  }) as any;

  if (!store) {
    return { hasAccess: false, store: null };
  }

  const isStoreUser = store.users?.some((user: any) => user.id === parseInt(userId));

  const isAdminUser = store.admin_users?.some((admin: any) => admin.id === parseInt(userId));

  return {
    hasAccess: isStoreUser || isAdminUser,
    store,
    isAdmin: isAdminUser
  };
}

export default factories.createCoreController('api::store.store', ({ strapi }) => ({
  ...factories.createCoreController('api::store.store'),

  /**
   * GET /api/stores/:id/settings
   */
  async getSettings(ctx) {
    try {
      const { id } = ctx.params;
      const userId = ctx.state.user?.id;
      console.log(`get:store:settings:${id}`);

      const { hasAccess, store } = await checkUserStoreAccess(strapi, userId, id);
      if (!hasAccess) {
        return ctx.forbidden(`403:store:${store.title}`);
      }

      if (!store) {
        return ctx.notFound('Store not found');
      }

      return ctx.send({
        store: store?.[0]?.data,
      });

    } catch (error) {
      console.error('Error fetching store settings:', error);
      return ctx.internalServerError('Failed to fetch store settings');
    }
  },

  /**
   * GET /api/stores/:slug/settings
   */
  async getSettingsBySlug(ctx) {
    try {
      const { slug } = ctx.params;
      console.log(`get:store:settings:${slug}`);

      const stores = await strapi.documents('api::store.store').findMany({
        filters: { slug: slug },
        populate: ['settings', 'SEO.socialImage', 'Logo', 'URLS', 'Favicon', 'Cover',],
      }) as any;

      if (!stores?.length) {
        return ctx.notFound('Store not found');
      }

      return ctx.send({
        data: stores,
      });
    } catch (error) {
      console.error('Error fetching store settings:', error);
      return ctx.internalServerError('Failed to fetch store settings');
    }
  },

  /**
   * PUT /api/stores/:id/settings
   */
  async updateSettings(ctx) {
    try {
      const { id } = ctx.params;
      const data = ctx.request.body?.data || {};
      const userId = ctx.state.user?.id;
      console.log(`put:store:settings:${id}`);

      if (!userId) {
        return ctx.unauthorized('Authentication required');
      }

      const { hasAccess, store } = await checkUserStoreAccess(strapi, userId, id);

      if (!hasAccess) {
        return ctx.forbidden(`403:store:${store.title}`);
      }

      if (!store) {
        return ctx.notFound(`404:store:${id}`);
      }

      let settings;
      let isNewSettings = false;
      if (store.settings) {
        settings = await strapi.documents('api::store.store-setting').update({
          documentId: store.settings.documentId,
          data,
        });
      } else {
        settings = await strapi.documents('api::store.store-setting').create({
          data: {
            ...data,
            store: id,
          },
        });
        isNewSettings = true;
      }

      return ctx.send({
        data: settings,
        message: isNewSettings ? 'Settings created successfully' : 'Settings updated successfully',
        created: isNewSettings,
      });
    } catch (error) {
      console.error('Error updating store settings:', error);
      return ctx.internalServerError('Failed to update store settings');
    }
  },
}));
