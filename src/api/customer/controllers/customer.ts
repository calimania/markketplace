/**
 * customer controller - Simple vanilla controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::customer.customer', ({ strapi }) => ({
  // Standard CRUD operations work out of the box

  // Smart search customers
  async search(ctx) {
    const { query, limit = 10 } = ctx.query;

    if (!query || typeof query !== 'string' || query.length < 2) {
      return ctx.badRequest('Query parameter required (minimum 2 characters)');
    }

    try {
      const searchLimit = typeof limit === 'string' ? parseInt(limit) : 10;

      const customers = await strapi.documents('api::customer.customer').findMany({
        filters: {
          $or: [
            { email: { $containsi: query } },
            { phone: { $containsi: query } },
            { firstName: { $containsi: query } },
            { lastName: { $containsi: query } }
          ]
        },
        populate: {
          appointments: {
            fields: ['appointmentDate', 'status', 'type'],
            sort: 'appointmentDate:desc',
            limit: 3
          }
        },
        sort: 'updatedAt:desc',
        limit: searchLimit
      });

      // Format results for UI
      const results = customers.map(customer => ({
        id: (customer as any).documentId,
        email: (customer as any).email,
        name: `${(customer as any).firstName} ${(customer as any).lastName}`.trim(),
        phone: (customer as any).phone,
        spent: (customer as any).totalSpent || 0,
        sessions: (customer as any).totalSessions || 0,
        lastSeen: (customer as any).lastSessionDate,
        active: (customer as any).isActive,
        recent: ((customer as any).appointments || []).slice(0, 2)
      }));

      return ctx.send({
        data: results,
        meta: { query, count: results.length, hasMore: results.length === searchLimit }
      });
    } catch (error) {
      console.error('Customer search error:', error);
      return ctx.internalServerError('Search failed');
    }
  },

  // Find customer by email
  async findByEmail(ctx) {
    const { email } = ctx.query;

    if (!email) {
      return ctx.badRequest('Email parameter required');
    }

    try {
      const customers = await strapi.documents('api::customer.customer').findMany({
        filters: {
          email: { $eqi: email as string }
        },
        populate: {
          appointments: {
            fields: ['appointmentDate', 'status', 'type'],
            sort: 'appointmentDate:desc',
            limit: 5
          },
          user: {
            fields: ['username', 'email']
          }
        }
      });

      if (customers.length === 0) {
        return ctx.send({ data: null, exists: false });
      }

      const customer = customers[0] as any;
      return ctx.send({
        data: {
          id: customer.documentId,
          email: customer.email,
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          phone: customer.phone,
          spent: customer.totalSpent || 0,
          sessions: customer.totalSessions || 0,
          active: customer.isActive,
          recent: (customer.appointments || []).slice(0, 3),
          linkedUser: customer.user
        },
        exists: true
      });
    } catch (error) {
      console.error('Email lookup error:', error);
      return ctx.internalServerError('Lookup failed');
    }
  }
}));
