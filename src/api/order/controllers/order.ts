/**
 * order controller
 */
import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
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

  async customerOrders(ctx) {
    const user = ctx.state.user;

    console.log({ user })

    if (!user || !user.email) {
      return ctx.unauthorized('Missing or invalid token');
    }

    const orders = await strapi.documents('api::order.order').findMany({
      filters: {
        Shipping_Address: {
          email: {
            $containsi: user.email,
          },
        },
      },
      populate: ['Shipping_Address', 'Details.product', 'Details.product.Thumbnail'],
    });

    return orders;
  }
}));
