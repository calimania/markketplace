export type Store = {
  title: string;
  slug: string;
  documentId: string;
  Favicon: {
    url: string;
  },
  settings: {
    email_header_message: string;
    store_name_override: string;
    welcome_email_text: string;
    dashboard_url: string;
    domain: string;
  }
};

type EmailLayout = {
  content: string;
  title: string;
  store?: Store;
};

/**
 * Common HTML/CSS to include in emails
 * @param props.content - HTML from the email being sent
 * @param props.title - Title property for the email
 * @param props.store - Store & settings to override template content
 * @returns
 */
export const emailLayout = ({ content, title, store }: EmailLayout) => {
  console.log({ store: store?.documentId || store?.slug });

  const logoUrl = store?.Favicon?.url;

  const preheader = store?.settings?.email_header_message || `Thank you for using ${store?.title || 'Markkët'}!`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - ${store?.settings?.store_name_override || store?.title}</title>
      <style>
        body { background: #fffbe7; color: #222; margin:0; font-family: 'Inter', Arial, sans-serif; }
      </style>
    </head>
    <body style="background:#fffbe7; color:#222; margin:0; font-family:'Inter',Arial,sans-serif;">
      <span style="display:none; max-height:0; max-width:0; opacity:0; overflow:hidden; visibility:hidden;">${preheader}</span>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbe7;">
        <tr>
          <td align="center">
            <table width="666" cellpadding="0" cellspacing="0" border="0" style="background:#fff; border-radius:14px; box-shadow:0 2px 16px #ff00cf22; margin:32px 0;">
              <tr>
                <td style="padding:18px 20px 0 20px; text-align:left;">
                  ${(logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:40px; margin-bottom:8px;" />` : '')}
                  <span style="color:#ff00cf; font-size:2rem; font-weight:900; letter-spacing:2px; margin-left:8px;">${store?.title || 'Markkët'}</span>
                </td>
              </tr>
              <tr>
                <td style="height:4px; background:linear-gradient(90deg,#fbda0d 60%,#ff00cf 100%); margin:8px 0;"></td>
              </tr>
              <tr>
                <td style="padding:24px 20px 12px 20px;">
                  <div style="font-size:1.3rem; font-weight:900; color:#0057ad; margin-bottom:16px; letter-spacing:1px;">${store?.title || ''}</div>
                  ${content || ''}
                </td>
              </tr>
              <tr>
                <td style="padding:10px 12px; text-align:left; margin-top:8px; border-bottom:2px solid #fbda0d; font-size:9px; color:#666;">
                  Powered by <a href="https://dev.markket.place" style="color:#0057ad;">Markkët</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `.replace(/\n|(\s\s)/g, '');
};

/**
 * Order Notification Email Template
 *
 * @param order Stripe order information, contained in the body
 * @returns
 */
export const OrderNotificationHTml = (order: any) => {
  // <p>Order Amount: ${((order?.data?.object?.total_amount || 0) / 100)}</p>
  const content = `
    <p>Thank you for your order!</p>
    <div class="event-details">
      <h3>Order</h3>
      <p>Order ID: ${order?.data?.object?.id}</p>
      <p class="greeting">Dear <span class="name">buyer</span>,</p>
      <p class="message">Thank you for your order!</p>
      <a href="https://markket.place/receipt?session_id=${order?.data?.object?.id}">
        View Receipt
      </a>
      <p>The seller has been notified and will reach out if more information is needed.</p>
    </div>
  `;

  const title = 'Markkët: Order Confirmation';

  return emailLayout({ content, title });
};

/**
 * RSVP Notification Email Template
 *
 * @param event
 * @returns
 */
export const RSVPNotificationHTml = (event: any) => {

  const content = `
    <!--<h1>Order Confirmation</h1>
    <p>Thank you for your order!</p>
    <p>Order ID: ${event?.data?.object?.id}</p>-->
    <p class="greeting">Dear <span class="name">{{name}}</span>,</p>
    <p class="message">Thank you for confirming your attendance to our upcoming event. We're excited to have you join us!</p>
    <div class="event-details">
      <h3>Event Details</h3>
      <p><strong>Event:</strong> {{eventName}}</p>
      <p><strong>Date:</strong> {{eventDate}}</p>
      <p><strong>Time:</strong> {{startTime}} - {{endTime}}</p>
      <p><strong>Your Email:</strong> {{email}}</p>
    </div>
  `;

  const title = 'Markkët: RSVP Confirmation';

  return emailLayout({ content, title });
};

/**
 * Notifies Store.user[].email about a purchase
 *
 * @param order, store
 * @returns
 */
export const OrderStoreNotificationEmailHTML = (order: { documentId: string, Amount: number, }, store: { title: string, documentId: string }) => {
  console.log({ order: order?.documentId });

  const content = `
    <h2>You must construct additional pylons</h2>
    <p>A new order has been placed in your store: ${store?.title || ''}</p>
    <p><strong>$${order?.Amount}</strong></p>
    <p>order id: ${order?.documentId}</p>
    <p>Visit the Dashboard to view details</p>
    <a href="https://de.markket.place/dashboard/crm?store=${store?.documentId}&order_id=${order?.documentId}#orders">/dashboard/crm</a>
    </div>
  `;

  const title = 'Markkët: Order notification';

  return emailLayout({ content, title });
};
