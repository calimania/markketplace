/**
 * markket controller
 */
import { version } from '../../../../package.json';
const { createCoreController } = require('@strapi/strapi').factories;
const modelId = "api::markket.markket";

import { createPaymentLinkWithPriceIds, getSessionById } from '../services/stripe';
import { sendOrderNotification } from '../services/notification';

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
    const body = ctx.request?.body || {};
    let message = 'action started';
    let link = body;

    if (body?.id?.startsWith('evt_')) {
      body.action = `stripe:${body.type}`;
    }

    console.log(`markket.create:${body.action || 'default'}`);

    if (body?.action === 'stripe.link') {
      link = await createPaymentLinkWithPriceIds(body?.prices || [], !!body?.includes_shipping, !!body?.stripe_test);
      message = 'stripe link created';
    }

    if (body?.action === 'stripe.receipt' && body?.session_id) {
      link = await getSessionById(body?.session_id, body?.session_id?.includes('cs_test'));
      message = 'stripe session retrieved';
    }

    if (body?.action == 'stripe:checkout.session.completed') {
      // @TODO: Created Order record
      const sendEmail = await sendOrderNotification({ strapi, order: body });
      link = { body, sendEmail };
    }

    // Create a markket transaction record
    await strapi.service(modelId).create({
      locale: 'en',
      data: {
        Key: `markket.create.${body?.action || 'default'}`,
        Content: {
          link: link || '',
          product: body?.product,
          total: body?.total,
        },
        // @TODO: Review authorization, token or related user
        user_key_or_id: "",
      }
    });

    ctx.send({
      message: `action ${body?.action} completed`,
      data: {
        info: message,
        link: link || '',
      },
    });
  },
}));
