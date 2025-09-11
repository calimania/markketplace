/**
 * order controller
 */
import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
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
