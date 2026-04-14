import { requireUser } from '../../../services/api-auth';

function getBuyerEmail(ctx: any): string | null {
  const user = requireUser(ctx);
  if (!user) {
    return null;
  }

  const email = String(user.email || '').trim().toLowerCase();
  if (!email) {
    ctx.unauthorized('Authenticated user email is required');
    return null;
  }

  return email;
}

function getPagination(ctx: any): { page: number; skip: number; limit: number } {
  const page = Math.max(1, parseInt(String(ctx.query?.page || '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(ctx.query?.pageSize || '25'), 10)));
  return {
    page,
    skip: (page - 1) * limit,
    limit,
  };
}

function sanitizeBuyerOrder(order: any): any {
  if (!order) {
    return null;
  }

  const {
    extensions,
    extra,
    Payment_attempts,
    STRIPE_PAYMENT_ID,
    ...rest
  } = order;

  return rest;
}

export default {
  /**
   * GET /api/buyer/orders?storeRef=...&status=...&q=...&page=1&pageSize=25
   * Returns buyer orders by matching authenticated user email against Shipping_Address.email.
   */
  async orders(ctx: any) {
    const email = getBuyerEmail(ctx);
    if (!email) {
      return;
    }

    const { page, skip, limit } = getPagination(ctx);
    const storeRef = String(ctx.query?.storeRef || '').trim();
    const status = String(ctx.query?.status || '').trim();
    const q = String(ctx.query?.q || '').trim();

    const filters: any = {
      Shipping_Address: {
        email: {
          $eqi: email,
        },
      },
    };

    if (storeRef) {
      filters.store = { $or: [{ documentId: storeRef }, { slug: storeRef }] };
    }

    if (status) {
      filters.Status = status;
    }

    if (q) {
      filters.$or = [
        { uuid: { $containsi: q } },
        { Currency: { $containsi: q } },
      ];
    }

    const [items, total] = await Promise.all([
      strapi.documents('api::order.order').findMany({
        filters,
        populate: ['store', 'Shipping_Address', 'Details.product', 'Details.product.Thumbnail', 'shipments'],
        sort: ['createdAt:desc'],
        skip,
        limit,
      }) as Promise<any[]>,
      strapi.documents('api::order.order').count({ filters }),
    ]);

    return ctx.send({
      ok: true,
      data: (items || []).map(sanitizeBuyerOrder),
      pagination: {
        page,
        pageSize: limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  },

  /**
   * GET /api/buyer/orders/:documentId
   */
  async order(ctx: any) {
    const email = getBuyerEmail(ctx);
    if (!email) {
      return;
    }

    const documentId = String(ctx.params?.documentId || '').trim();
    if (!documentId) {
      return ctx.badRequest('documentId is required');
    }

    const items = await strapi.documents('api::order.order').findMany({
      filters: {
        documentId: { $eq: documentId },
        Shipping_Address: {
          email: {
            $eqi: email,
          },
        },
      },
      populate: ['store', 'Shipping_Address', 'Details.product', 'Details.product.Thumbnail', 'shipments'],
      limit: 1,
    }) as any[];

    const order = items?.[0] || null;
    if (!order) {
      return ctx.notFound('Order not found');
    }

    return ctx.send({
      ok: true,
      data: sanitizeBuyerOrder(order),
    });
  },

  /**
   * POST /api/buyer/orders/:documentId/subscribe
   * Reuses subscriber service to add buyer email to the store default subscriber list.
   */
  async subscribeFromOrder(ctx: any) {
    const email = getBuyerEmail(ctx);
    if (!email) {
      return;
    }

    const documentId = String(ctx.params?.documentId || '').trim();
    if (!documentId) {
      return ctx.badRequest('documentId is required');
    }

    const items = await strapi.documents('api::order.order').findMany({
      filters: {
        documentId: { $eq: documentId },
        Shipping_Address: {
          email: {
            $eqi: email,
          },
        },
      },
      populate: ['store'],
      limit: 1,
    }) as any[];

    const order = items?.[0] || null;
    if (!order) {
      return ctx.notFound('Order not found');
    }

    const storeDocumentId = String(order?.store?.documentId || '').trim();
    if (!storeDocumentId) {
      return ctx.badRequest('Order store is missing');
    }

    const result = await (strapi.service('api::subscriber.subscriber') as any).subscribeAndQueueSync({
      email,
      storeDocumentId,
      source: 'buyer_order_subscribe',
    });

    return ctx.send({
      ok: !!result?.success,
      message: result?.message || 'Subscription request processed',
      data: result?.data || null,
      error: result?.error,
    });
  },
};
