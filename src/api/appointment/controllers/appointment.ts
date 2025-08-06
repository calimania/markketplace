/**
 * appointment controller - Simple vanilla controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::appointment.appointment', ({ strapi }) => ({
  // Standard CRUD operations work out of the box

  // Custom search by customer
  async searchByCustomer(ctx) {
    const { customer_id, email, limit = 10 } = ctx.query;

    if (!customer_id && !email) {
      return ctx.badRequest('Missing customer_id or email parameter');
    }

    try {
      const searchLimit = parseInt(limit as string) || 10;

      const appointments = await strapi.documents('api::appointment.appointment').findMany({
        filters: {
          $or: [
            ...(customer_id ? [{ customer: { documentId: customer_id as string } }] : []),
            ...(customer_id ? [{ customers: { documentId: customer_id as string } }] : []),
            ...(email ? [{ customer: { email: { $eqi: email as string } } }] : []),
            ...(email ? [{ customers: { email: { $eqi: email as string } } }] : [])
          ]
        },
        populate: {
          customer: {
            fields: ['firstName', 'lastName', 'email', 'phone']
          },
          customers: {
            fields: ['firstName', 'lastName', 'email', 'phone']
          },
          practitioner: {
            fields: ['username', 'email']
          }
        },
        sort: 'appointmentDate:desc',
        limit: searchLimit
      });

      return ctx.send({
        data: appointments,
        meta: { count: appointments.length }
      });
    } catch (error) {
      console.error('Appointment search error:', error);
      return ctx.internalServerError('Search failed');
    }
  }
}));
