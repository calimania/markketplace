const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || '';
const SENDGRID_REPLY_TO_EMAIL = process.env.SENDGRID_REPLY_TO_EMAIL || '';
import { OrderNotificationHTml, RSVPNotificationHTml, OrderStoreNotificationEmailHTML } from './email.template';


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

type notifyStoreOfPurchaseProps = {
  strapi: any,
  order: {
    id?: string,
    documentId: string,
    Amount: number,
    Currency: string,
    buyer?: {
      email: string,
    },
    Shipping_Address?: {
      address_line1?: string,
      address_line2?: string,
      city?: string,
      state?: string,
      postal_code?: string,
      country?: string,
    },
    Details?: {
      Name?: string,
      Quantity?: number,
      Price?: number,
    }[],
  },
  emails: string[],
  store: {
    title: string,
    documentId: string,
  }
}

export const notifyStoreOfPurchase = async ({ strapi, order, emails, store }: notifyStoreOfPurchaseProps) => {
  console.info('notification::store:purchase', {
    order: order?.documentId || order?.id,
    strapi: !!strapi,
    from: !!SENDGRID_FROM_EMAIL,
    reply_to: !!SENDGRID_REPLY_TO_EMAIL,
    emails: emails?.length,
  });

  if (!SENDGRID_FROM_EMAIL || !SENDGRID_REPLY_TO_EMAIL) {
    console.warn('missing.sendgrid.config');
    return;
  }

  return await strapi.plugins['email'].services.email.send({
    to: emails,
    from: SENDGRID_FROM_EMAIL,
    cc: SENDGRID_REPLY_TO_EMAIL,
    replyTo: SENDGRID_REPLY_TO_EMAIL,
    subject: `${store.title || 'Markkët'}: Order Notification`,
    text: 'New order in your store! - log in to view details',
    html: OrderStoreNotificationEmailHTML(order, store),
  });
};

export const sendOrderNotification = async ({ strapi, order, store }) => {
  console.info('notification::stripe:checkout.session.completed', {
    order: order?.documentId || order?.id,
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
    subject: `${store.title || 'Markkët'}: Order Confirmation`,
    text: 'Thank you for your order!',
    html: OrderNotificationHTml(order),
  });
};
