import { checkStoreAccess, ERRORS, requireUser } from '../../../services/api-auth';
import {
  getIntegrationPlan,
  placeholderCreateStripeConnectOnboardingLink,
  placeholderSendNewsletter,
  placeholderSyncSubscriber,
} from '../services/crm';

function getStoreRef(ctx: any): string {
  return String(ctx.query?.storeRef || ctx.query?.store || '').trim();
}

function getPagination(ctx: any): { skip: number; limit: number; page: number } {
  const page = Math.max(1, parseInt(String(ctx.query?.page || '1'), 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(ctx.query?.pageSize || '25'), 10)));
  return {
    page,
    skip: (page - 1) * pageSize,
    limit: pageSize,
  };
}

async function requireStoreScope(ctx: any): Promise<any | null> {
  const user = requireUser(ctx);
  if (!user) {
    return null;
  }

  const storeRef = getStoreRef(ctx);
  if (!storeRef) {
    ctx.badRequest('storeRef query parameter is required');
    return null;
  }

  const access = await checkStoreAccess(strapi, user.id, storeRef);
  if (!access?.store || !access?.hasAccess) {
    ctx.forbidden(ERRORS.STORE_NOT_FOUND);
    return null;
  }

  return { user, store: access.store, isAdmin: access.isAdmin };
}

export default {
  /**
   * GET /api/crm/orders?storeRef=...&status=...&q=...&page=1&pageSize=25
   */
  async orders(ctx: any) {
    const scope = await requireStoreScope(ctx);
    if (!scope) {
      return;
    }

    const { page, skip, limit } = getPagination(ctx);
    const status = String(ctx.query?.status || '').trim();
    const q = String(ctx.query?.q || '').trim();

    const filters: any = {
      store: { documentId: scope.store.documentId },
    };

    if (status) {
      filters.Status = status;
    }

    if (q) {
      filters.$or = [
        { uuid: { $containsi: q } },
        { STRIPE_PAYMENT_ID: { $containsi: q } },
        { Shipping_Address: { email: { $containsi: q } } },
      ];
    }

    const [items, total] = await Promise.all([
      strapi.documents('api::order.order').findMany({
        filters,
        populate: ['buyer', 'shipments'],
        sort: ['createdAt:desc'],
        skip,
        limit,
      }) as Promise<any[]>,
      strapi.documents('api::order.order').count({ filters }),
    ]);

    const data = (items || []).map((item: any) => {
      const { extensions, ...rest } = item;
      return rest;
    });

    return ctx.send({
      ok: true,
      data,
      pagination: {
        page,
        pageSize: limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  },

  /**
   * GET /api/crm/subscribers?storeRef=...&syncStatus=...&q=...&page=1&pageSize=25
   */
  async subscribers(ctx: any) {
    const scope = await requireStoreScope(ctx);
    if (!scope) {
      return;
    }

    const { page, skip, limit } = getPagination(ctx);
    const syncStatus = String(ctx.query?.syncStatus || '').trim();
    const q = String(ctx.query?.q || '').trim();

    const filters: any = {
      stores: { documentId: scope.store.documentId },
    };

    if (syncStatus) {
      filters.sync_status = syncStatus;
    }

    if (q) {
      filters.$or = [
        { Email: { $containsi: q } },
        { sendgrid_contact_id: { $containsi: q } },
      ];
    }

    const [items, total] = await Promise.all([
      (strapi.documents as any)('api::subscriber.subscriber').findMany({
        filters,
        populate: ['lists'],
        sort: ['createdAt:desc'],
        skip,
        limit,
      }) as Promise<any[]>,
      (strapi.documents as any)('api::subscriber.subscriber').count({ filters }),
    ]);

    const data = (items || []).map((item: any) => {
      const { extensions, ...rest } = item;
      return rest;
    });

    return ctx.send({
      ok: true,
      data,
      pagination: {
        page,
        pageSize: limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  },

  /**
   * GET /api/crm/newsletters?storeRef=...&status=...&q=...&page=1&pageSize=25
   */
  async newsletters(ctx: any) {
    const scope = await requireStoreScope(ctx);
    if (!scope) {
      return;
    }

    const { page, skip, limit } = getPagination(ctx);
    const status = String(ctx.query?.status || '').trim();
    const q = String(ctx.query?.q || '').trim();

    const filters: any = {
      store: { documentId: scope.store.documentId },
    };

    if (status) {
      filters.status = status;
    }

    if (q) {
      filters.$or = [
        { title: { $containsi: q } },
        { subject: { $containsi: q } },
        { slug: { $containsi: q } },
      ];
    }

    const [items, total] = await Promise.all([
      (strapi.documents as any)('api::subscriber.newsletter').findMany({
        filters,
        populate: ['target_lists'],
        sort: ['createdAt:desc'],
        skip,
        limit,
      }) as Promise<any[]>,
      (strapi.documents as any)('api::subscriber.newsletter').count({ filters }),
    ]);

    const data = (items || []).map((item: any) => {
      const { extensions, ...rest } = item;
      return rest;
    });

    return ctx.send({
      ok: true,
      data,
      pagination: {
        page,
        pageSize: limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  },

  /**
   * GET /api/crm/customers?storeRef=...&q=...&page=1&pageSize=25
   * Lightweight rollup from orders + subscribers for CRM list views.
   */
  async customers(ctx: any) {
    const scope = await requireStoreScope(ctx);
    if (!scope) {
      return;
    }

    const { page, skip, limit } = getPagination(ctx);
    const q = String(ctx.query?.q || '').trim().toLowerCase();

    const [orders, subscribers, rsvps] = await Promise.all([
      strapi.documents('api::order.order').findMany({
        filters: { store: { documentId: scope.store.documentId } },
        populate: ['buyer'],
        sort: ['createdAt:desc'],
        limit: 500,
      }) as Promise<any[]>,
      strapi.documents('api::subscriber.subscriber').findMany({
        filters: { stores: { documentId: scope.store.documentId } },
        sort: ['createdAt:desc'],
        limit: 500,
      }) as Promise<any[]>,
      (strapi.documents as any)('api::rsvp.rsvp').findMany({
        filters: { store: { documentId: scope.store.documentId } },
        populate: ['event'],
        sort: ['createdAt:desc'],
        limit: 500,
      }) as Promise<any[]>,
    ]);

    const emptyRecord = (email: string) => ({
      email,
      name: null,
      ordersCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      rsvpsCount: 0,
      lastRsvpAt: null,
      subscriber: null,
    });

    const byEmail = new Map<string, any>();

    for (const order of orders || []) {
      const email = String(order?.Shipping_Address?.email || '').trim().toLowerCase();
      if (!email) {
        continue;
      }

      const prev = byEmail.get(email) || emptyRecord(email);
      if (!prev.name && order?.Shipping_Address?.name) {
        prev.name = order.Shipping_Address.name;
      }

      prev.ordersCount += 1;
      prev.totalSpent += Number(order?.Amount || 0);
      const createdAt = order?.createdAt || null;
      if (createdAt && (!prev.lastOrderAt || new Date(createdAt) > new Date(prev.lastOrderAt))) {
        prev.lastOrderAt = createdAt;
      }

      byEmail.set(email, prev);
    }

    for (const rsvp of rsvps || []) {
      const email = String(rsvp?.email || '').trim().toLowerCase();
      if (!email) {
        continue;
      }

      const prev = byEmail.get(email) || emptyRecord(email);
      if (!prev.name && rsvp?.name) {
        prev.name = rsvp.name;
      }

      prev.rsvpsCount += 1;
      const createdAt = rsvp?.createdAt || null;
      if (createdAt && (!prev.lastRsvpAt || new Date(createdAt) > new Date(prev.lastRsvpAt))) {
        prev.lastRsvpAt = createdAt;
      }

      byEmail.set(email, prev);
    }

    for (const sub of subscribers || []) {
      const email = String(sub?.Email || '').trim().toLowerCase();
      if (!email) {
        continue;
      }

      const prev = byEmail.get(email) || emptyRecord(email);
      if (!prev.name && sub?.Name) {
        prev.name = sub.Name;
      }

      prev.subscriber = {
        documentId: sub.documentId,
        active: !!sub.active,
        sync_status: sub.sync_status,
        unsubscribed_at: sub.unsubscribed_at || null,
      };

      byEmail.set(email, prev);
    }

    let data = Array.from(byEmail.values());
    if (q) {
      data = data.filter((item: any) => item.email.includes(q) || (item.name || '').toLowerCase().includes(q));
    }

    data.sort((a: any, b: any) => b.totalSpent - a.totalSpent);

    const total = data.length;
    const paged = data.slice(skip, skip + limit);

    return ctx.send({
      ok: true,
      data: paged,
      pagination: {
        page,
        pageSize: limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  },

  /**
   * GET /api/pagos/connect?storeRef=...
   */
  async stripeConnectStatus(ctx: any) {
    const scope = await requireStoreScope(ctx);
    if (!scope) {
      return;
    }

    const settings = scope.store.settings || null;
    const meta = settings?.meta || {};

    return ctx.send({
      ok: true,
      data: {
        store: {
          documentId: scope.store.documentId,
          slug: scope.store.slug,
          title: scope.store.title,
        },
        stripe_connect: {
          account_id: meta?.stripe_connect_account_id || null,
          onboarding_completed: !!meta?.stripe_connect_onboarding_completed,
          charges_enabled: !!meta?.stripe_connect_charges_enabled,
          payouts_enabled: !!meta?.stripe_connect_payouts_enabled,
          requirements_due: meta?.stripe_connect_requirements_due || [],
          status: meta?.stripe_connect_account_id ? 'connected' : 'not_connected',
          source: meta?.stripe_connect_account_id ? 'store.settings.meta' : 'placeholder',
        },
      },
      integrations: {
        required: getIntegrationPlan().stripeConnect,
      },
    });
  },

  /**
   * POST /api/pagos/connect/onboarding?storeRef=...
   * Placeholder for Stripe Connect account/onboarding link creation.
   */
  async createStripeConnectOnboardingLink(ctx: any) {
    const scope = await requireStoreScope(ctx);
    if (!scope) {
      return;
    }

    const body = ctx.request?.body || {};
    const payload = body.data && typeof body.data === 'object' ? body.data : body;

    const result = await placeholderCreateStripeConnectOnboardingLink({
      storeDocumentId: scope.store.documentId,
      refreshUrl: payload.refreshUrl,
      returnUrl: payload.returnUrl,
    });

    return ctx.send(result);
  },

  /**
   * POST /api/crm/subscribers/:documentId/sync?storeRef=...
   * Placeholder for SendGrid subscriber sync orchestration.
   */
  async syncSubscriber(ctx: any) {
    const scope = await requireStoreScope(ctx);
    if (!scope) {
      return;
    }

    const subscriberDocumentId = String(ctx.params?.documentId || '').trim();
    if (!subscriberDocumentId) {
      return ctx.badRequest('documentId is required');
    }

    const result = await placeholderSyncSubscriber({
      storeDocumentId: scope.store.documentId,
      subscriberDocumentId,
    });

    return ctx.send(result);
  },

  /**
   * POST /api/crm/newsletters/:documentId/send?storeRef=...
   * Placeholder for SendGrid newsletter send orchestration.
   */
  async sendNewsletter(ctx: any) {
    const scope = await requireStoreScope(ctx);
    if (!scope) {
      return;
    }

    const newsletterDocumentId = String(ctx.params?.documentId || '').trim();
    if (!newsletterDocumentId) {
      return ctx.badRequest('documentId is required');
    }

    const body = ctx.request?.body || {};
    const payload = body.data && typeof body.data === 'object' ? body.data : body;

    const mode = payload.mode === 'transactional' ? 'transactional' : 'single_send';

    const result = await placeholderSendNewsletter({
      storeDocumentId: scope.store.documentId,
      newsletterDocumentId,
      mode,
    });

    return ctx.send(result);
  },
};
