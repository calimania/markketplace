/**
 * inbox controller
 */

import { factories } from '@strapi/strapi';
import { checkStoreAccess, requireUser, ERRORS } from '../../../services/api-auth';
import {
  createInboxThreadRecord,
  getInboxThreadById,
  listInboxThreadsForUser,
  sendSendGridOutboundEmail,
  sendSendGridOutboundReplyByThread,
  updateInboxThreadState,
} from '../services/sendgrid-inbox';

function getInboundSecret(): string {
  return process.env.SENDGRID_INBOUND_SECRET || process.env.INBOX_WEBHOOK_SECRET || '';
}

export default factories.createCoreController('api::inbox.inbox', ({ strapi }) => ({
  async processInbound(ctx: any) {
    const expectedSecret = getInboundSecret();
    const providedSecret = ctx.request?.query?.secret || ctx.request?.body?.secret || ctx.request?.headers?.['x-inbox-secret'];

    if (expectedSecret && providedSecret !== expectedSecret) {
      return ctx.unauthorized('Invalid inbox webhook secret');
    }

    try {
      const result = await createInboxThreadRecord({ strapi, ctx });
      return ctx.send(result);
    } catch (error: any) {
      strapi.log.error('Inbox inbound failed', error);
      return ctx.send({ status: 'error', message: 'Failed to process inbound email' });
    }
  },

  async sendOutbound(ctx: any) {
    try {
      const result = await sendSendGridOutboundEmail({ strapi, ctx });
      return ctx.send(result);
    } catch (error: any) {
      strapi.log.error('Inbox outbound failed', error);
      return ctx.badRequest(error.message || 'Failed to send outbound email');
    }
  },

  async sendOutboundForThread(ctx: any) {
    try {
      const result = await sendSendGridOutboundReplyByThread({ strapi, ctx });
      return ctx.send(result);
    } catch (error: any) {
      strapi.log.error('Inbox thread outbound failed', error);
      return ctx.badRequest(error.message || 'Failed to send outbound thread reply');
    }
  },

  async getThreadById(ctx: any) {
    try {
      const user = requireUser(ctx);
      if (!user) return;

      const result = await getInboxThreadById({ strapi, ctx });
      return ctx.send(result);
    } catch (error: any) {
      strapi.log.error('Inbox get thread failed', error);
      return ctx.badRequest(error.message || 'Failed to load inbox thread');
    }
  },

  async listThreads(ctx: any) {
    try {
      const user = requireUser(ctx);
      if (!user) return;

      const query = ctx.request?.query || {};
      const storeSlug = String(query.store || query.storeSlug || '').trim();
      const storeId = String(query.storeId || query.storeDocumentId || '').trim();
      const storeRef = storeId || storeSlug;

      if (!storeRef) {
        return ctx.badRequest('Missing store context. Provide `store` (slug) or `storeId` (documentId).');
      }

      const access = await checkStoreAccess(strapi, user.id, storeRef);
      if (!access?.store || !access?.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      ctx.state.inboxStore = access.store;

      const result = await listInboxThreadsForUser({ strapi, ctx });
      return ctx.send(result);
    } catch (error: any) {
      strapi.log.error('Inbox list failed', error);
      return ctx.internalServerError(error.message || 'Failed to load inbox threads');
    }
  },

  async updateThreadState(ctx: any) {
    try {
      const result = await updateInboxThreadState({ strapi, ctx });
      return ctx.send(result);
    } catch (error: any) {
      strapi.log.error('Inbox thread update failed', error);
      return ctx.badRequest(error.message || 'Failed to update inbox thread');
    }
  },
}));
