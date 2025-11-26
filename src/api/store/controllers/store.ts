/**
 * store controller
 */

import { factories } from '@strapi/strapi'
import {
  getDashboardData,
  getContentCounts,
  getSalesSummary,
  getRecentOrders,
  getStripeStatus,
  getRecentActivity,
  getQuickStats,
  getVisibilityFlags,
} from '../services/dashboard';
import { ApiExplorerHTML } from '../templates/api-explorer.html';
import { ApiExplorerJS } from '../templates/api-explorer.js';

/** Checks for store record for user and user_admin records */
async function checkUserStoreAccess(strapi: any, userId: string, storeId: string) {
  if (!userId) {
    console.log('[STORE_ACCESS] No user ID provided');
    return { hasAccess: false, store: null };
  }

  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId,
    populate: ['users', 'admin_users', 'settings'],
  }) as any;

  if (!store) {
    console.log('[STORE_ACCESS] Store not found', { storeId });
    return { hasAccess: false, store: null };
  }

  // Convert to number for comparison (Strapi stores relation IDs as integers)
  const userIdNum = parseInt(userId, 10);

  // Debug: Log what we found
  console.log('[STORE_ACCESS] Store relation check', {
    storeId: storeId.substring(0, 10) + '...',
    userId: userIdNum,
    users: store.users?.map((u: any) => ({ id: u.id, username: u.username })),
    admin_users: store.admin_users?.map((u: any) => ({ id: u.id, username: u.username })),
  });

  const isStoreUser = store.users?.some((user: any) => user.id === userIdNum);
  const isAdminUser = store.admin_users?.some((admin: any) => admin.id === userIdNum);

  console.log('[STORE_ACCESS] Access result', {
    userIdNum,
    isStoreUser,
    isAdminUser,
    hasAccess: isStoreUser || isAdminUser,
  });

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

  /**
   * GET /api/stores/:id/dashboard
   * Get complete dashboard data
   * PROTECTED: Store owner only
   */
  async getDashboard(ctx: any) {
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    console.log('[DASHBOARD] Request received', {
      storeId: id.substring(0, 10) + '...',
      userId: userId || 'none',
      hasUser: !!ctx.state.user,
      userEmail: ctx.state.user?.email,
    });

    if (!userId) {
      console.log('[DASHBOARD] Unauthorized - no user ID');
      return ctx.unauthorized('Authentication required');
    }

    const { hasAccess, store } = await checkUserStoreAccess(strapi, userId, id);

    if (!hasAccess) {
      console.log('[DASHBOARD] Forbidden - user not linked to store');
      return ctx.forbidden('You do not have access to this store');
    }

    if (!store) {
      console.log('[DASHBOARD] Store not found');
      return ctx.notFound('Store not found');
    }

    try {
      const data = await getDashboardData(id);

      return ctx.send({
        message: 'Dashboard data retrieved',
        data,
      });
    } catch (error) {
      console.error('[STORE_CONTROLLER] Dashboard fetch failed:', error.message);
      return ctx.internalServerError('Failed to fetch dashboard data');
    }
  },

  /**
   * GET /api/stores/:id/content-counts
   * Get content type counts
   * PUBLIC: Used for homepage button visibility
   */
  async getContentCounts(ctx: any) {
    const { id } = ctx.params;

    try {
      const counts = await getContentCounts(id);

      return ctx.send({
        message: 'Content counts retrieved',
        data: counts,
      });
    } catch (error) {
      console.error('[STORE_CONTROLLER] Content counts failed:', error.message);
      return ctx.internalServerError('Failed to fetch content counts');
    }
  },

  /**
   * GET /api/stores/:id/sales-summary
   * Get sales analytics
   * PROTECTED: Store owner only
   */
  async getSalesSummary(ctx: any) {
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;
    const days = parseInt(ctx.query.days || '30', 10);

    if (!userId) {
      return ctx.unauthorized('Authentication required');
    }

    const { hasAccess, store } = await checkUserStoreAccess(strapi, userId, id);

    if (!hasAccess) {
      return ctx.forbidden('You do not have access to this store');
    }

    if (!store) {
      return ctx.notFound('Store not found');
    }

    try {
      const summary = await getSalesSummary(id, days);

      return ctx.send({
        message: 'Sales summary retrieved',
        data: summary,
      });
    } catch (error) {
      console.error('[STORE_CONTROLLER] Sales summary failed:', error.message);
      return ctx.internalServerError('Failed to fetch sales summary');
    }
  },

  /**
   * GET /api/stores/:id/recent-orders
   * Get recent orders
   * PROTECTED: Store owner only
   */
  async getRecentOrders(ctx: any) {
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;
    const limit = parseInt(ctx.query.limit || '10', 10);

    if (!userId) {
      return ctx.unauthorized('Authentication required');
    }

    const { hasAccess, store } = await checkUserStoreAccess(strapi, userId, id);

    if (!hasAccess) {
      return ctx.forbidden('You do not have access to this store');
    }

    if (!store) {
      return ctx.notFound('Store not found');
    }

    try {
      const orders = await getRecentOrders(id, limit);

      return ctx.send({
        message: 'Recent orders retrieved',
        data: orders,
      });
    } catch (error) {
      console.error('[STORE_CONTROLLER] Recent orders failed:', error.message);
      return ctx.internalServerError('Failed to fetch recent orders');
    }
  },

  /**
   * GET /api/stores/:id/stripe-status
   * Get Stripe Connect status
   * PUBLIC: Used for UI badges
   */
  async getStripeStatus(ctx: any) {
    const { id } = ctx.params;

    try {
      const status = await getStripeStatus(id);
      return ctx.send({ data: status });
    } catch (error) {
      console.error('[STORE_CONTROLLER] Stripe status failed:', error.message);
      return ctx.internalServerError('Failed to fetch Stripe status');
    }
  },

  /**
   * GET /api/stores/:id/activity
   * Get recent activity timeline
   * PROTECTED: Store owner only
   */
  async getRecentActivity(ctx: any) {
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized('Authentication required');
    }

    const { hasAccess } = await checkUserStoreAccess(strapi, userId, id);
    if (!hasAccess) {
      return ctx.forbidden('Access denied');
    }

    try {
      const limit = parseInt(ctx.query.limit || '10', 10);
      const activity = await getRecentActivity(id, limit);
      return ctx.send({ data: activity });
    } catch (error) {
      console.error('[STORE_CONTROLLER] Activity fetch failed:', error.message);
      return ctx.internalServerError('Failed to fetch activity');
    }
  },

  /**
   * GET /api/stores/:id/quick-stats
   * Get quick stats for homepage
   * PUBLIC: Used for homepage hero
   */
  async getQuickStats(ctx: any) {
    const { id } = ctx.params;

    try {
      const stats = await getQuickStats(id);
      return ctx.send({ data: stats });
    } catch (error) {
      console.error('[STORE_CONTROLLER] Quick stats failed:', error.message);
      return ctx.internalServerError('Failed to fetch quick stats');
    }
  },

  /**
   * GET /api/stores/:id/visibility
   * Get UI visibility flags
   * PUBLIC: Used for conditional rendering
   */
  async getVisibilityFlags(ctx: any) {
    const { id } = ctx.params;

    try {
      const flags = await getVisibilityFlags(id);
      return ctx.send({ data: flags });
    } catch (error) {
      console.error('[STORE_CONTROLLER] Visibility flags failed:', error.message);
      return ctx.internalServerError('Failed to fetch visibility flags');
    }
  },

  /**
   * GET /api/api-explorer
   * Simple HTML API explorer for testing endpoints
   */
  async apiExplorer(ctx: any) {
    ctx.type = 'text/html';
    ctx.body = ApiExplorerHTML;
  },

  /**
   * GET /api/api-explorer.js
   * External JavaScript for API explorer (CSP compliant)
   */
  async apiExplorerJS(ctx: any) {
    const js = ApiExplorerJS;

    ctx.type = 'application/javascript';
    ctx.body = js;
  },

}));
