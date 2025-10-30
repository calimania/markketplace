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
  const logoUrl = store?.Favicon?.url;
  const preheader = store?.settings?.email_header_message || `Thank you for using ${store?.title || 'Markkët'}!`;
  const storeName = store?.settings?.store_name_override || store?.title || 'Markkët';
  const storeUrl = store?.settings?.domain || 'https://markket.place';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>${title} - ${storeName}</title>
    </head>
    <body style="background:#fffbe7;color:#222;margin:0;font-family:Inter,Arial,sans-serif">
      <span style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}</span>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbe7">
        <tr>
          <td align="center">
            <table width="666" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:14px;box-shadow:0 2px 16px rgba(0,0,0,0.08);margin:32px 0">
              <tr>
                <td style="padding:24px 32px 16px 32px;text-align:left">
                  ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:44px;margin-bottom:12px;border-radius:6px">` : ''}
                  <div style="color:#1a1a1a;font-size:1.6rem;font-weight:600;letter-spacing:-0.5px;margin-bottom:4px">${storeName}</div>
                </td>
              </tr>
              <tr>
                <td style="height:1px;background:linear-gradient(90deg,rgba(251,218,13,0.3) 0%,rgba(255,0,207,0.2) 100%)"></td>
              </tr>
              <tr>
                <td style="padding:28px 32px 24px 32px">
                  <div style="font-size:1.2rem;font-weight:700;color:#2d3748;margin-bottom:20px;letter-spacing:-0.3px">${title}</div>
                  <div style="line-height:1.6;color:#4a5568">
                    ${content || ''}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 20px 32px;text-align:center;border-top:1px solid #f7fafc">
                  <div style="font-size:11px;color:#a0aec0;letter-spacing:0.5px">
                    <a href=${storeUrl} style="color:#a0aec0;text-decoration:none">${storeName}</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `.replace(/\n\s+/g, '\n').replace(/^\n|\n$/g, '');
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
export const OrderStoreNotificationEmailHTML = (order: {
  documentId: string,
  Amount: number,
  Currency: string,
  buyer?: { email: string },
  Shipping_Address?: {
    address_line1?: string,
    address_line2?: string,
    city?: string,
    state?: string,
    postal_code?: string,
    country?: string
  },
  Details?: Array<{
    Name?: string,
    Quantity?: number
  }>
}, store: { title: string, documentId: string }) => {
  console.log('notification:order:store', { order: order?.documentId });

  const formatAddress = (addr?: typeof order.Shipping_Address) => {
    if (!addr) return 'No shipping address provided';
    return [
      addr.address_line1,
      addr.address_line2,
      [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
      addr.country
    ].filter(Boolean).join('\n');
  };

  const content = `
    <h2>Order Received!</h2>
    <p>A new order has been placed in your store: <strong>${store?.title || ''}</strong></p>

    <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
      <h3 style="margin: 0 0 10px 0;">Order Details</h3>
      <p><strong>Amount:</strong> ${order?.Currency || '$'}${order?.Amount}</p>
      <p><strong>Order ID:</strong> ${order?.documentId}</p>
      ${order?.buyer?.email ? `<p><strong>Buyer Email:</strong> ${order?.buyer.email}</p>` : ''}

      ${order?.Details && order.Details.length > 0 ? `
        <h4 style="margin: 15px 0 5px 0;">Items Ordered:</h4>
        <ul style="margin: 0; padding-left: 20px;">
          ${order.Details.map(item => `
            <li>${item.Name || 'Unnamed item'}${item.Quantity ? ` × ${item.Quantity}` : ''}</li>
          `).join('')}
        </ul>
      ` : ''}

      ${order?.Shipping_Address ? `
        <h4 style="margin: 15px 0 5px 0;">Shipping Address:</h4>
        <pre style="margin: 0; white-space: pre-wrap; font-family: inherit;">${formatAddress(order.Shipping_Address)}</pre>
      ` : ''}
    </div>

    <p>Visit your Dashboard to view complete details and process this order:</p>
    <a href="https://de.markket.place/dashboard/crm?store=${store?.documentId}&order_id=${order?.documentId}#orders"
       style="display: inline-block; padding: 10px 20px; background: #4a5568; color: white; text-decoration: none; border-radius: 6px; margin-top: 10px;">
      View in Dashboard
    </a>
  `;

  const title = 'Markkët: Order notification';

  return emailLayout({ content, title });
};
