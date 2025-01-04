/**
 * markket controller
 */
import { version } from '../../../../package.json';
const { createCoreController } = require('@strapi/strapi').factories;
const modelId = "api::markket.markket";

import { createPaymentLinkWithPriceIds } from '../services/stripe';

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
    const body = JSON.parse(ctx.request.body);
    let message = 'action completed';
    console.log(`markket.create:${body.action}`, { body });

    let link = null;
    if (body?.action === 'stripe.link') {
      link = await createPaymentLinkWithPriceIds(body?.prices || []);
      message = 'stripe link created';
    }

    if (body?.action === 'stripe.webhook') {
      // @TODO Store transaction record & send pertinent notifications
    }

    // Storing record of transaction
    await strapi.service(modelId).create({
      locale: 'en',
      data: {
        Key: `markket.create.${body?.action || 'default'}`,
        Content: {
          link,
          produt: body?.product,
          total: body?.total,
        },
        user_key_or_id: "", // @TODO: Review authorization, token or related user
      }
    });

    ctx.send({
      message: `action ${body?.action} completed`,
      data: {
        info: message,
        link,
      },
    });
  },
}));
