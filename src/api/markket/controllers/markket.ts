/**
 * markket controller
 */
import { version } from '../../../../package.json';
const { createCoreController } = require('@strapi/strapi').factories;
const modelId = "api::markket.markket";

const NODE_ENV = process.env.NODE_ENV || 'development';
const STRIPE_PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY || 'n/a';
const SENDGRID_REPLY_TO_EMAIL = process.env.SENDGRID_REPLY_TO_EMAIL || 'n/a';

module.exports = createCoreController(modelId, ({ strapi }) => ({
  async about(ctx: any) {
    console.info('markket.get');
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
  async create(ctx: any) {
    console.info('markket.create');
    await strapi.service(modelId).create({
      locale: 'en',
      data: {
        Key: "markket.create",
        Content: ctx.request.body,
        user_key_or_id: "", // @TODO: Review authorization, token or related user
      }
    });
    // @TODO: send notification emails, perform STRIPE actions, etc, here
    ctx.send({
      message: 'This is the create endpoint',
      data: {
        info: 'Markket.place is an international commercial community',
        version,
      },
    });
  }
}));
