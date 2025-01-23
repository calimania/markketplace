const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || '';
const SENDGRID_REPLY_TO_EMAIL = process.env.SENDGRID_REPLY_TO_EMAIL || '';
import { OrderNotificationHTml, RSVPNotificationHTml } from './template';


export const sendRSVPNotification = async ({ strapi, rsvp, event }) => {
  console.info('notification::rsvp:created', {
    rsvp: !!rsvp,
    event: !!event,
    strapi: !!strapi,
    from: !!SENDGRID_FROM_EMAIL,
    reply_to: !!SENDGRID_REPLY_TO_EMAIL,
  });

  if (!SENDGRID_FROM_EMAIL || !SENDGRID_REPLY_TO_EMAIL) {
    return;
  }

  // if (!order?.data?.object?.customer_details?.email) {
  //   return;
  // }

  // const customer = event?.data?.object?.customer_details;
  const customer = { email: rsvp.email };

  return await strapi.plugins['email'].services.email.send({
    to: customer.email,
    from: SENDGRID_FROM_EMAIL, //e.g. single sender verification in SendGrid
    cc: SENDGRID_REPLY_TO_EMAIL,
    replyTo: SENDGRID_REPLY_TO_EMAIL,
    subject: 'Markkët: RSVP Confirmation',
    text: 'RSVP confirmation!',
    html: RSVPNotificationHTml(event),
  });
};


export const sendOrderNotification = async ({ strapi, order }) => {
  console.info('notification::stripe:checkout.session.completed', {
    order,
    strapi: !!strapi,
    from: !!SENDGRID_FROM_EMAIL,
    reply_to: !!SENDGRID_REPLY_TO_EMAIL,
  });

  if (!SENDGRID_FROM_EMAIL || !SENDGRID_REPLY_TO_EMAIL) {
    return;
  }

  if (!order?.data?.object?.customer_details?.email) {
    return;
  }

  const customer = order?.data?.object?.customer_details;

  return await strapi.plugins['email'].services.email.send({
    to: customer.email,
    from: SENDGRID_FROM_EMAIL, //e.g. single sender verification in SendGrid
    cc: SENDGRID_REPLY_TO_EMAIL,
    replyTo: SENDGRID_REPLY_TO_EMAIL,
    subject: 'Markkët: Order Confirmation',
    text: 'Thank you for your order!',
    html: OrderNotificationHTml(order),
  });
};
