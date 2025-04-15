/**
 * markket controller
 */
import { version } from '../../../../package.json';
const { createCoreController } = require('@strapi/strapi').factories;
const modelId = "api::markket.markket";

import { createPaymentLinkWithPriceIds, getSessionById, getAccount } from '../services/stripe';
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
      const response = await createPaymentLinkWithPriceIds({
        prices: body?.prices || [],
        include_shipping: !!body?.includes_shipping,
        stripe_test: !!body?.stripe_test,
        store_id: body?.store_id,
        redirect_to_url: body?.redirect_to_url,
        total: body?.total,
      });
      link = {
        response,
        body,
      };
      message = 'stripe link created';
    }

    if (body?.action === 'stripe.account') {
      const response = await getAccount(body?.store_id);
      return ctx.send({
        message: 'stripe account retrieved',
        data: {
          info: response,
        },
      });
    }

    if (body?.action === 'stripe.receipt' && body?.session_id) {
      const response = await getSessionById(body?.session_id, body?.session_id?.includes('cs_test'));
      link = {
        response,
        body,
      };
      message = 'stripe session retrieved';
    }

    if (body?.action == 'stripe:checkout.session.completed') {
      // @TODO: Created Order record
      const response = await sendOrderNotification({ strapi, order: body });
      link = { body, response };
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
