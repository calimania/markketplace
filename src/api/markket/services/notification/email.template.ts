type EmailLayout = {
  content: string;
  title: string;
};

export const emailLayout = ({ content, title }: EmailLayout) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Markkët</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; background: #fffbe7; color: #222; margin:0; }
        .email-container { margin:32px auto; background:#fff; border-radius:14px; box-shadow:0 2px 16px #ff00cf22; max-width:480px; border:3px solid #fbda0d; }
        .header { background:#fff; padding:18px 20px 0 20px; text-align:left; }
        .logo { color:#ff00cf; font-size:2rem; font-weight:900; letter-spacing:2px; margin:0; }
        .divider { height:4px; background:linear-gradient(90deg,#fbda0d 60%,#ff00cf 100%); margin:8px 0; }
        .content { padding:24px 20px 12px 20px; }
        .title { font-size:1.3rem; font-weight:900; color:#0057ad; margin-bottom:16px; letter-spacing:1px; }
        .footer { padding:10px 12px; text-align:center; border-top:2px solid #fbda0d; background:#fffbe7; font-size:12px; color:#666; }
        .footer a { color:#0057ad; font-weight:700; }
        @media (max-width:600px) { .content { padding:12px 4px; } }
      </style>
    </head>
    <body>
      <div class="email-container">
        <header class="header">
          <span class="logo">Markkët</span>
        </header>
        <div class="divider"></div>
        <main class="content">
          <div class="title">${title}</div>
          ${content}
        </main>
        <footer class="footer">Powered by <a href="https://dev.markket.place">Markkët</a></footer>
      </div>
    </body>
    </html>
  `.replace(/\n|(\s\s)/, '');
};

/**
 * Order Notification Email Template
 *
 * @param order
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
  // <p>Order Amount: ${((order?.data?.object?.total_amount || 0) / 100)}</p>
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
