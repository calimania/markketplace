/**
 * subscriber controller
 */

import { factories } from '@strapi/strapi'

/**
 * TODO(newsletter-phase-1): Controller flow map
 * 1) Capture subscriber create request (email + store documentId + optional list documentIds)
 * 2) Persist subscriber in Strapi first (source of truth)
 * 3) Trigger post-create async sync via subscriber service (non-blocking)
 * 4) Expose sync status endpoints for store owners
 * 5) Keep client API shape stable (no required frontend changes)
 */

export default factories.createCoreController('api::subscriber.subscriber', ({ strapi }) => ({
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

  /**
   * TODO(newsletter-phase-1): POST /api/subscribers/subscribe
   * - validate store documentId + list ids
   * - create/update subscriber + membership rows
   * - enqueue sendgrid sync job (or setImmediate async call)
   * - return immediate success with sync_status=pending
   */
  async subscribe(ctx) {
    const body = ctx.request.body || {};
    const payload = body?.data || body;

    const email = String(payload?.email || payload?.Email || '').trim();
    const storeFromArray = Array.isArray(payload?.stores) ? payload.stores[0] : undefined;
    const storeDocumentId = String(
      payload?.storeDocumentId ||
      payload?.store?.documentId ||
      payload?.store ||
      storeFromArray?.documentId ||
      storeFromArray ||
      ''
    ).trim();
    const firstName = payload?.firstName ? String(payload.firstName).trim() : undefined;
    const lastName = payload?.lastName ? String(payload.lastName).trim() : undefined;

    const result = await strapi.service('api::subscriber.subscriber').subscribeAndQueueSync({
      email,
      storeDocumentId,
      firstName,
      lastName,
      source: 'public_subscribe_api'
    });

    if (!result?.success) {
      return ctx.badRequest(result?.message || 'Failed to subscribe');
    }

    return ctx.send(result);
  },

  async unsubscribe(ctx) {
    const body = ctx.request.body || {};
    const payload = body?.data || body;

    const email = String(payload?.email || payload?.Email || '').trim();
    const storeFromArray = Array.isArray(payload?.stores) ? payload.stores[0] : undefined;
    const storeDocumentId = String(
      payload?.storeDocumentId ||
      payload?.store?.documentId ||
      payload?.store ||
      storeFromArray?.documentId ||
      storeFromArray ||
      ''
    ).trim();

    if (!email || !storeDocumentId) {
      return ctx.badRequest('email and storeDocumentId are required');
    }

    const result = await strapi.service('api::subscriber.subscriber').unsubscribeFromStore({
      email,
      storeDocumentId,
    });

    if (!result?.success) {
      return ctx.badRequest(result?.message || 'Failed to unsubscribe');
    }

    return ctx.send(result);
  },

  /**
   * TODO(newsletter-phase-1): GET /api/subscribers/:documentId/sync-status
   * - return subscriber-level sync status + per-list membership status
   */
  async syncStatus(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.unauthorized('Authentication required');
    }

    const { documentId } = ctx.params;
    const result = await strapi.service('api::subscriber.subscriber').getSubscriberSyncStatus(documentId);

    if (!result?.success) {
      return ctx.notFound(result?.message || 'Subscriber status not found');
    }

    return ctx.send(result);
  },

  /**
   * TODO(newsletter-phase-1): POST /api/subscribers/:documentId/sync
   * - manual re-sync trigger for store owner
   * - optional list-scoped sync payload
   */
  async sync(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.unauthorized('Authentication required');
    }

    const { documentId } = ctx.params;
    const body = ctx.request.body || {};
    const payload = body?.data || body;
    const storeDocumentId = String(payload?.storeDocumentId || '').trim();

    if (!storeDocumentId) {
      return ctx.badRequest('storeDocumentId is required');
    }

    const result = await strapi.service('api::subscriber.subscriber').syncSubscriberToSendGrid({
      subscriberDocumentId: documentId,
      storeDocumentId
    });

    if (!result?.success) {
      return ctx.badRequest(result?.message || 'Sync failed');
    }

    return ctx.send(result);
  }
}));
