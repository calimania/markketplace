
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
      <title>RSVP Confirmation - Markkët</title>
      <style>
        /* Reset and base styles */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          background-color: #f5f5f5;
          color: #333333;
        }

        /* Container */
        .email-container {

          margin: 0 auto;
          background-color: #ffffff;
        }

        /* Header */
        .header {
          background-color: #0057ad;
          padding: 24px;
          text-align: center;
        }

        .logo {
          color: #fbda0d;
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 1px;
          margin: 0;
        }

        /* Divider */
        .divider {
          height: 4px;
          background-color: #fbda0d;
          margin-bottom: 16px;
        }

        /* Content */
        .content {
          padding: 32px;
          max-width: 600px;
        }

        .title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 16px;
        }

        .greeting {
          margin-bottom: 8px;
        }

        .name {
          color: #ff00cf;
          font-weight: 600;
        }

        .message {
          margin-bottom: 16px;
        }

        /* Event Details */
        .event-details {
          background-color: #f9f9f9;
          padding: 24px;
          border-radius: 8px;
          margin-bottom: 32px;
        }

        .event-details h3 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 16px;
        }

        .event-details p {
          margin-bottom: 12px;
        }

        .event-details strong {
          font-weight: 600;
        }

        /* Footer */
        .footer {
          padding: 24px;
          text-align: center;
          border-top: 1px solid #fbda0d;
        }

        .footer p {
          color: #666666;
          font-size: 14px;
        }

        .footer a {
          color: #0057ad;
          text-decoration: none;
        }

        .footer a:hover {
          text-decoration: underline;
        }

        /* Responsive */
        @media (max-width: 600px) {
          .content {
            padding: 24px 16px;
          }

          .event-details {
            padding: 16px;
          }
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <header class="header">
          <h1 class="logo">Markkët</h1>
        </header>

        <!-- Yellow Divider -->
        <div class="divider"></div>

        <!-- Content -->
        <main class="content">
          <h2 class="title">${title} 🎉</h2>

          ${content}

          <div class="message">
            <p>If you need to make any changes, please don't hesitate to contact us.</p>
            <p style="margin-top: 16px;">
              Best regards,<br>
              The Markkët Team
            </p>
          </div>
        </main>

        <!-- Footer -->
        <footer class="footer">
          <p>
            Powered by
            <a href="https://markket.place/about">Markkët</a>
            & SendGrid
          </p>
        </footer>
      </div>
    </body>
    </html>
  `;
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
