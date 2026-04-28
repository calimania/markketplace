/**
 * rsvp controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::rsvp.rsvp', ({ strapi }) => ({
  async create(ctx) {
    const body = ctx.request.body?.data || ctx.request.body || {};

    // Normalize event to documentId string (accept v4 id, documentId string, or object)
    let eventDocumentId: string | null = null;
    const rawEvent = body.event;
    if (typeof rawEvent === 'string') {
      eventDocumentId = rawEvent;
    } else if (typeof rawEvent === 'object' && rawEvent !== null) {
      eventDocumentId = rawEvent.documentId || String(rawEvent.id || '');
    }

    if (!eventDocumentId) {
      return ctx.badRequest('event is required');
    }

    // Look up the event to get its store
    let storeDocumentId: string | null = null;
    try {
      const event = await strapi.documents('api::event.event').findOne({
        documentId: eventDocumentId,
        populate: ['stores'],
        status: 'published',
      }) as any;

      if (!event) {
        return ctx.badRequest('Event not found or not published');
      }

      const firstStore = Array.isArray(event.stores) ? event.stores[0] : null;
      storeDocumentId = firstStore?.documentId || null;
    } catch (err: any) {
      console.error('[RSVP_CREATE] Event lookup failed:', err.message);
    }

    // Rewrite body with normalized relations
    ctx.request.body = {
      data: {
        ...body,
        event: eventDocumentId,
        ...(storeDocumentId ? { store: storeDocumentId } : {}),
      },
    };

    return super.create(ctx);
  },
}));
