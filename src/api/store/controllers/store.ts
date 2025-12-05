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
import { decryptCredentials, sensitiveFields } from '../../../services/encryption';
import { testSendGridConnection } from '../../../services/sendgrid-marketing';
import { testOdooConnection } from '../../../services/odoo-partner';
import fs from 'fs';
import path from 'path';

/** Checks for store record for user and user_admin records */
async function checkUserStoreAccess(
  strapi: any,
  userId: string,
  id: string,
) {
  if (!userId) {
    console.log('[STORE_ACCESS] No user ID provided');
  }

  try {

    const store = await strapi.documents('api::store.store').findOne({
      documentId: id,
      populate: ['users', 'admin_users', 'settings'],
    }) as any;

    if (!store) {
      console.log('[STORE_ACCESS] Store not found in database', {
        documentId: id,
        queryWorked: true,
        resultWasNull: true
      });
      return { hasAccess: false, store: null };
    }

    if (!userId) {
      return { hasAccess: false, store };
    }

    const userIdNum = parseInt(userId, 10);
    const isStoreUser = store.users?.some((user: any) => user?.id === userIdNum);
    const isAdminUser = store.admin_users?.some((admin: any) => admin?.id === userIdNum);

    console.log('[STORE_ACCESS] Access check', {
      storeId: id.substring(0, 10) + '...',
      storeName: store.title,
      userId: userIdNum,
      isStoreUser,
      isAdminUser,
      hasAccess: isStoreUser || isAdminUser,
    });

    return {
      hasAccess: isStoreUser || isAdminUser,
      store,
      isAdmin: isAdminUser
    };
  } catch (error) {
    console.error('[STORE_ACCESS] Database query failed', {
      documentId: id,
      error: error.message,
      stack: error.stack
    });
    return { hasAccess: false, store: null, error: error.message };
  }
}

export default factories.createCoreController('api::store.store', ({ strapi }) => ({
  ...factories.createCoreController('api::store.store'),

  /**
   * Override find to exclude extensions from client responses
   */
  async find(ctx) {
    const { data, meta } = await super.find(ctx);
    // Remove extensions field from all results
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
   * Serve static HTML file with clean URL
   */
  async apiExplorer(ctx: any) {
    try {
      const filePath = path.join(process.cwd(), 'public', 'api-explorer.html');
      const html = fs.readFileSync(filePath, 'utf8');

      ctx.type = 'text/html';
      ctx.body = html;
    } catch (error) {
      console.error('[API_EXPLORER] Failed to read file:', error.message);
      return ctx.notFound('API Explorer not found');
    }
  },

  /**
   * GET /api/api-explorer.js
   * Serve static JS file
   */
  async apiExplorerJS(ctx: any) {
    try {
      const filePath = path.join(process.cwd(), 'public', 'api-explorer.js');
      const js = fs.readFileSync(filePath, 'utf8');

      ctx.type = 'application/javascript';
      ctx.body = js;
    } catch (error) {
      console.error('[API_EXPLORER] Failed to read file:', error.message);
      return ctx.notFound('API Explorer JS not found');
    }
  },

  /**
   * GET /api/stores/:documentId/extensions-debug
   * Quick check: Are extensions present? Are credentials encrypted?
   */
  async debugExtensions(ctx: any) {
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    console.log('[EXTENSIONS_DEBUG]', {
      storeId: id?.substring(0, 10) + '...',
      authenticated: !!userId,
    });

    const storeData = await strapi.documents('api::store.store').findOne({
      documentId: id,
      populate: ['extensions']
    });

    if (!storeData) {
      return ctx.notFound('Store not found');
    }

    const storeName = storeData.title;
    const extensionsCount = storeData.extensions?.length || 0;

    console.log('[EXTENSIONS_DEBUG] Store:', storeName, '- Extensions:', extensionsCount);

    // Fields that should be encrypted (matches SENSITIVE_FIELDS in encryption.ts)
    const SENSITIVE_FIELDS = sensitiveFields;

    const analyzeCredentials = (credentials: any) => {
      if (!credentials || typeof credentials !== 'object') return null;

      const analysis: Record<string, any> = {};
      Object.keys(credentials).forEach(key => {
        const value = credentials[key];
        if (typeof value === 'string') {
          const isEncrypted = /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
          const shouldBeEncrypted = SENSITIVE_FIELDS.includes(key);

          analysis[key] = {
            should_encrypt: shouldBeEncrypted,
            is_encrypted: isEncrypted,
            status: shouldBeEncrypted
              ? (isEncrypted ? 'secure' : 'needs_encryption')
              : (isEncrypted ? 'over_encrypted' : 'plain_ok'),
            length: value.length,
            preview: isEncrypted ? value.substring(0, 16) + '...' : '[REDACTED]'
          };

          const statusIcon = shouldBeEncrypted
            ? (isEncrypted ? '✓' : '✗')
            : (isEncrypted ? '⚠' : '○');

          console.log(`[EXTENSIONS_DEBUG] ${key}:`,
            statusIcon,
            shouldBeEncrypted ? 'SENSITIVE' : 'PLAIN',
            isEncrypted ? 'ENCRYPTED' : 'PLAIN',
            `(${value.length} chars)`
          );
        }
      });
      return analysis;
    };

    const extensions = storeData.extensions?.map((ext: any) => {
      const credAnalysis = analyzeCredentials(ext.credentials);

      // Check if all sensitive fields are encrypted
      const sensitiveFieldsSecure = credAnalysis
        ? Object.entries(credAnalysis).every(([key, analysis]: [string, any]) =>
          !analysis.should_encrypt || analysis.is_encrypted
        )
        : true;

      const statusMsg = credAnalysis
        ? (sensitiveFieldsSecure ? 'secure' : 'needs encryption')
        : 'no credentials';

      console.log('[EXTENSIONS_DEBUG]', ext.key, '-',
        ext.active ? 'active' : 'inactive',
        statusMsg
      );

      return {
        key: ext.key,
        active: ext.active,
        triggers: ext.triggers?.length || 0,
        credentials_status: credAnalysis ? (sensitiveFieldsSecure ? 'encrypted' : 'partial') : 'none',
        credentials_analysis: credAnalysis,
        last_run: ext.last_run,
        run_count: ext.run_count || 0
      };
    }) || [];

    const allSecure = extensions.every(ext =>
      ext.credentials_status === 'encrypted' || ext.credentials_status === 'none'
    );

    console.log('[EXTENSIONS_DEBUG] Security status:', allSecure ? 'All secure' : 'Review needed');

    return ctx.send({
      store: storeName,
      extensions_count: extensionsCount,
      security_status: allSecure ? 'secure' : 'needs_review'
    });
  },

  /**
   * POST /api/stores/:id/test-extension
   * Test extension credentials by making a real API call
   * PROTECTED: Store owner only
   */
  async testExtension(ctx: any) {
    const { id } = ctx.params;
    const { extensionKey } = ctx.request.body || {};
    const userId = ctx.state.user?.id;

    console.log('[TEST_EXTENSION] Request received', {
      storeId: id?.substring(0, 10) + '...',
      extensionKey,
      authenticated: !!userId
    });

    if (!userId) {
      return ctx.unauthorized('Authentication required');
    }

    if (!extensionKey) {
      return ctx.badRequest('Extension key is required in request body');
    }

    const { hasAccess } = await checkUserStoreAccess(strapi, userId, id);
    if (!hasAccess) {
      return ctx.forbidden('Access denied');
    }

    const storeData = await strapi.documents('api::store.store').findOne({
      documentId: id,
      populate: ['extensions']
    });

    const extension = storeData.extensions.find((ext: any) => ext.key === extensionKey);

    if (!extension || !extension.credentials) {
      return ctx.notFound(`Extension ${extensionKey}: or credentials not found `);
    }

    let credentials: any;
    try {
      credentials = decryptCredentials(extension.credentials);
    } catch (error: any) {
      console.error('[TEST_EXTENSION] Decryption failed:', error.message);
      return ctx.send({
        success: false,
        error: 'Failed to decrypt credentials',
        message: 'Invalid or corrupted credentials'
      });
    }

    const config = (extension.config || {}) as Record<string, any>;

    console.log('[TEST_EXTENSION] Testing extension', {
      key: extension.key,
      hasCredentials: !!credentials,
      hasApiKey: !!credentials.api_key,
    });

    if (extensionKey.includes('sendgrid')) {
      const result = await testSendGridConnection(credentials, config);
      return ctx.send(result);
    }

    if (extensionKey.includes('odoo')) {
      const result = await testOdooConnection(credentials, config as { company_id: number });
      return ctx.send(result);
    }

    return ctx.send({
      success: false,
      message: `Task failed successfully: ${extensionKey}`,
      available_tests: ['markket:sendgrid:*', 'markket:odoo:*']
    });
  },
}));
