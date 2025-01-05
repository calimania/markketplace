const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || '';
const SENDGRID_REPLY_TO_EMAIL = process.env.SENDGRID_REPLY_TO_EMAIL || '';

const OrderNotificationHTml = (order: any) => {
  // <p>Order Amount: ${((order?.data?.object?.total_amount || 0) / 100)}</p>
  return `
    <h1>Order Confirmation</h1>
    <p>Thank you for your order!</p>
    <p>Order ID: ${order?.data?.object?.id}</p>
    <p>
      <a href="https://markket.place/receipt?session_id=${order?.data?.object?.id}">
        View Receipt
      </a>
    </p>
  `;
};

export const sendOrderNotification = async ({ strapi, order }) => {
  console.info('notification::stripe:checkout.session.completed', {
    order,
    strapi: !!strapi
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
