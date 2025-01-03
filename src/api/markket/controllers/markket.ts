/**
 * markket controller
 */
import { version } from '../../../../package.json';
const { createCoreController } = require('@strapi/strapi').factories;
const modelId = "api::markket.markket";

const NODE_ENV = process.env.NODE_ENV || 'development';
const STRIPE_PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY || 'n/a';
const SENDGRID_REPLY_TO_EMAIL = process.env.SENDGRID_REPLY_TO_EMAIL || 'n/a';

module.exports = createCoreController(modelId, ({ /**strapi */ }) => ({

  async about(ctx: any) {
    console.info('markket.get');
    // await strapi.service(modelId).find(ctx.request.body)

    ctx.send({
      message: 'This is the about endpoint',
      data: {
        info: 'Markket.place is an international commercial community',
        version,
        NODE_ENV,
        STRIPE_PUBLIC_KEY,
        SENDGRID_REPLY_TO_EMAIL,
      },
    });
  },
}));

