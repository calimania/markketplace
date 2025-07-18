/**
 * markket controller
 *
 * Interfaces with our data & other extensions to augment functionality
 *
 * Features:
 *  - Activity log
 *  - Stripe webhooks
 *  - Stripe payment links
 *  - Stripe connect actions
 *
 * @TODO: Abstract model creation to utilities
 */
import { version } from '../../../../package.json';
const { createCoreController } = require('@strapi/strapi').factories;
const modelId = "api::markket.markket";

import { createPaymentLinkWithPriceIds, getSessionById, getAccount } from '../services/stripe';
import { sendOrderNotification, notifyStoreOfPurchase } from '../services/notification';

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
      const { product, prices, includes_shipping, stripe_test, store_id, redirect_to_url, total } = body;

      const response = await createPaymentLinkWithPriceIds({
        prices: body?.prices || [],
        include_shipping: !!includes_shipping,
        stripe_test: !!stripe_test,
        store_id,
        redirect_to_url,
        total,
      });

      link = {
        response,
        body,
      };

      const order = await strapi.service('api::order.order').create({
        data: {
          store: body.store_id,
          Amount: body.total,
          Currency: 'USD',
          Status: 'open',
          Shipping_Address: {},
          STRIPE_PAYMENT_ID: response?.id,
          Details: prices.map((price: any) => {
            return {
              Price: parseInt(price?.unit_amount || '0', 10),
              product,
              Quantity: parseInt(price.quantity || '0', 10),
              Name: price?.Name,
            }
          })
        }
      });
      message = 'stripe link & order created';
    }

    if (body?.action == 'stripe:checkout.session.completed') {
      const session = body.data?.object as any;
      const paymentLinkId = session.payment_link;
      const shipping = session.shipping || session.customer_details?.address;
      const buyer_email = session.customer_details?.email || body.customer_email;
      const storeUsers = [];

      const order = paymentLinkId && await strapi.db.query('api::order.order').findOne({
        where: { STRIPE_PAYMENT_ID: paymentLinkId },
        populate: ['store.users']
      });

      if (order) {
        console.log(`updating:order:${order.documentId}`);
        const prevAttempts = Array.isArray(order.Payment_attempts) ? order.Payment_attempts : [];
        const newAttempt = {
          Timestampt: new Date(),
          buyer_email: buyer_email,
          Status: 'Succeeded',
          reason: '',
        };

        let shippingData = order.Shipping_Address;
        if (!shippingData && shipping) {
          shippingData = {
            street: shipping.address?.line1 || shipping.line1,
            street_2: shipping.address?.line2 || shipping.line2,
            city: shipping.address?.city || shipping.city,
            state: shipping.address?.state || shipping.state,
            zipcode: shipping.address?.postal_code || shipping.postal_code,
            country: shipping.address?.country || shipping.country,
            name: shipping.name || session.customer_details?.name,
            email: buyer_email,
          };
        }

        const update = await strapi.service('api::order.order').update(order.documentId, {
          data: {
            Status: 'complete',
            Payment_attempts: [
              ...prevAttempts,
              newAttempt
            ],
            Shipping_Address: shippingData || order.Shipping_Address,
          }
        });
      }

      if (order?.store?.documentId) {
        storeUsers.push(...order?.store?.users);
        const emails = storeUsers.filter(user => user.confirmed).map(user => user.email);

        if (emails?.length > 0) {
          await notifyStoreOfPurchase({ strapi, order, emails, store: order?.store as {} });
        }
      }

      const response = sendOrderNotification({ strapi, order: body });
      link = { body, response };
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
