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
    email_footer?: string;
    email_theme?: Record<string, any>;
    branding?: Record<string, any>;
  }
};

type EmailLayout = {
  content: string;
  title: string;
  store?: Store;
};

type EmailTheme = {
  shellBackground: string;
  cardBackground: string;
  panelBackground: string;
  textColor: string;
  mutedTextColor: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  borderColor: string;
  inkBackground: string;
  softSecondaryBackground: string;
  softTertiaryBackground: string;
};

function escapeHtml(value: any): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveTheme(store?: Store): EmailTheme {
  const emailTheme = store?.settings?.email_theme || {};
  const branding = store?.settings?.branding || {};

  return {
    shellBackground: emailTheme.backgroundColor || branding.backgroundColor || '#fffafb',
    cardBackground: emailTheme.cardBackgroundColor || branding.cardBackgroundColor || '#ffffff',
    panelBackground: emailTheme.panelBackgroundColor || branding.panelBackgroundColor || '#fdf1f7',
    textColor: emailTheme.textColor || branding.textColor || '#1e1b4b',
    mutedTextColor: emailTheme.mutedTextColor || branding.mutedTextColor || '#4b5563',
    primaryColor: emailTheme.primaryColor || branding.primaryColor || '#db2777',
    secondaryColor: emailTheme.secondaryColor || branding.secondaryColor || '#06b6d4',
    tertiaryColor: emailTheme.tertiaryColor || branding.tertiaryColor || '#eab308',
    borderColor: emailTheme.borderColor || branding.borderColor || '#fbcfe8',
    inkBackground: emailTheme.inkBackground || branding.inkBackground || '#1e1b4b',
    softSecondaryBackground: emailTheme.softSecondaryBackground || branding.softSecondaryBackground || '#ecfeff',
    softTertiaryBackground: emailTheme.softTertiaryBackground || branding.softTertiaryBackground || '#fff8db',
  };
}

function renderEyebrow(text: string, theme: EmailTheme): string {
  return `<div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:${theme.primaryColor};font-weight:bold;margin:0 0 12px 0;">${escapeHtml(text)}</div>`;
}

function renderButton(label: string, href: string, theme: EmailTheme, fill: 'primary' | 'secondary' = 'primary'): string {
  const background = fill === 'secondary' ? theme.secondaryColor : theme.primaryColor;
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 8px 0;">
      <tr>
        <td bgcolor="${background}" style="border-radius:999px;">
          <a href="${href}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.6px;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>
  `.replace(/\n\s+/g, '\n').trim();
}

function renderInfoPanel(title: string, body: string, theme: EmailTheme): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background:${theme.panelBackground};border:1px dashed ${theme.borderColor};border-radius:18px;">
      <tr>
        <td width="8" bgcolor="${theme.primaryColor}" style="font-size:0;line-height:0;border-radius:18px 0 0 18px;">&nbsp;</td>
        <td style="padding:20px 22px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;color:${theme.textColor};font-style:italic;margin:0 0 10px 0;">${escapeHtml(title)}</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:${theme.textColor};">${body}</div>
        </td>
      </tr>
    </table>
  `.replace(/\n\s+/g, '\n').trim();
}

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
  const footerText = store?.settings?.email_footer || `Visit ${storeName} for more updates.`;
  const theme = resolveTheme(store);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>${title} - ${storeName}</title>
    </head>
    <body style="margin:0;padding:0;background:${theme.shellBackground};color:${theme.textColor};font-family:Arial,Helvetica,sans-serif;">
      <span style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</span>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.shellBackground};">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;margin:0 auto;">
              <tr>
                <td style="padding:0 0 14px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:0 2px 14px 2px;">
                        ${renderEyebrow('Curated message', theme)}
                        <div style="font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:0.95;color:${theme.textColor};font-weight:bold;letter-spacing:-1px;">${escapeHtml(storeName)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.cardBackground};border:1px solid ${theme.borderColor};border-radius:26px;">
                    <tr>
                      <td bgcolor="${theme.inkBackground}" style="padding:26px 28px 18px 28px;border-radius:26px 26px 0 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td valign="top" style="padding:0 12px 0 0;">
                              ${logoUrl ? `<img src="${logoUrl}" alt="${escapeHtml(storeName)} logo" style="display:block;height:48px;max-width:160px;border:0;outline:none;text-decoration:none;">` : ''}
                            </td>
                            <td align="right" valign="top">
                              <div style="display:inline-block;padding:7px 12px;background:${theme.primaryColor};border-radius:999px;font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.2;color:#ffffff;letter-spacing:1.4px;text-transform:uppercase;font-weight:bold;">Curated message</div>
                              <div style="padding-top:10px;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.6;color:#e9d5ff;letter-spacing:1.4px;text-transform:uppercase;">
                                ${escapeHtml(title)}
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 28px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td height="8" style="font-size:0;line-height:0;background:${theme.primaryColor};border-radius:999px;">&nbsp;</td>
                            <td width="8"></td>
                            <td height="8" style="font-size:0;line-height:0;background:${theme.secondaryColor};border-radius:999px;">&nbsp;</td>
                            <td width="8"></td>
                            <td height="8" style="font-size:0;line-height:0;background:${theme.tertiaryColor};border-radius:999px;">&nbsp;</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:26px 28px 14px 28px;">
                        <div style="font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1.05;color:${theme.textColor};font-style:italic;margin:0 0 10px 0;">${escapeHtml(title)}</div>
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.8;color:${theme.textColor};">${content || ''}</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 28px 26px 28px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${theme.borderColor};">
                          <tr>
                            <td style="padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:${theme.mutedTextColor};">
                              ${escapeHtml(footerText)}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-top:10px;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.6;color:${theme.mutedTextColor};letter-spacing:1.4px;text-transform:uppercase;">
                              <a href="${storeUrl}" style="color:${theme.secondaryColor};text-decoration:none;">${escapeHtml(storeUrl)}</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
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
  const theme = resolveTheme();
  const receiptUrl = `https://markket.place/receipt?session_id=${order?.data?.object?.id || ''}`;
  const content = `
    <p style="margin:0 0 14px 0;">Thank you for your order. Your receipt is ready and the seller has already been notified.</p>
    ${renderInfoPanel('Order details', `
      <p style="margin:0 0 8px 0;"><strong>Order ID:</strong> ${escapeHtml(order?.data?.object?.id || 'Pending')}</p>
      <p style="margin:0;">If any follow-up is needed, the seller will reach out directly.</p>
    `, theme)}
    ${renderButton('View receipt', receiptUrl, theme)}
    <p style="margin:16px 0 0 0;font-size:13px;line-height:1.7;color:${theme.mutedTextColor};">Keep this email for your records.</p>
  `;

  const title = 'Markkët: Order Confirmation';

  return emailLayout({ content, title });
};

function formatEventDate(value: any): string {
  if (!value) {
    return 'To be announced';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatEventTimeRange(start: any, end: any): string {
  if (!start && !end) {
    return 'To be announced';
  }

  const formatTime = (value: any) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value || '');
    }

    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const startLabel = formatTime(start);
  const endLabel = end ? formatTime(end) : '';
  return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
}

/**
 * RSVP Notification Email Template
 */
export const RSVPNotificationHTml = ({ rsvp, event, store }: { rsvp: any; event: any; store?: any }) => {
  const theme = resolveTheme(store);
  const calendarUrl = event?.calendarUrl || event?.data?.object?.calendarUrl || '';
  const attendeeName = rsvp?.name || rsvp?.user?.displayName || rsvp?.email || 'friend';
  const eventName = event?.Name || event?.title || 'Upcoming event';
  const eventDate = formatEventDate(event?.startDate);
  const eventTime = formatEventTimeRange(event?.startDate, event?.endDate);
  const attendeeEmail = rsvp?.email || '';

  const content = `
    <p style="margin:0 0 14px 0;">Hi ${escapeHtml(attendeeName)}, your RSVP is in. We saved your spot and put the essentials below.</p>
    ${renderInfoPanel('Event details', `
      <p style="margin:0 0 8px 0;"><strong>Event:</strong> ${escapeHtml(eventName)}</p>
      <p style="margin:0 0 8px 0;"><strong>Date:</strong> ${escapeHtml(eventDate)}</p>
      <p style="margin:0 0 8px 0;"><strong>Time:</strong> ${escapeHtml(eventTime)}</p>
      <p style="margin:0;"><strong>Email:</strong> ${escapeHtml(attendeeEmail)}</p>
    `, theme)}
    ${calendarUrl ? renderButton('Add to calendar', calendarUrl, theme, 'secondary') : ''}
    <p style="margin:16px 0 0 0;font-size:13px;line-height:1.7;color:${theme.mutedTextColor};">Bring this email with you if the event requires check-in.</p>
  `;

  const title = 'Markkët: RSVP Confirmation';

  return emailLayout({ content, title, store });
};

/**
 * Event Reminder Email Template
 * Sent to each approved RSVP attendee ~24h before the event starts.
 */
export const EventReminderEmailHtml = ({ event, store }: { event: any; store?: any }) => {
  const theme = resolveTheme(store);
  const attendeeName = 'friend';
  const eventName = event?.Name || event?.title || 'Upcoming event';
  const eventDate = formatEventDate(event?.startDate);
  const eventTime = formatEventTimeRange(event?.startDate, event?.endDate);
  const storeDomain = store?.settings?.domain || 'https://markket.place';
  const eventSlug = event?.slug || event?.documentId || '';
  const eventUrl = eventSlug ? `${storeDomain}/events/${eventSlug}` : storeDomain;

  const content = `
    <p style="margin:0 0 14px 0;">This is a friendly reminder that <strong>${escapeHtml(eventName)}</strong> is happening tomorrow.</p>
    ${renderInfoPanel('Event details', `
      <p style="margin:0 0 8px 0;"><strong>Event:</strong> ${escapeHtml(eventName)}</p>
      <p style="margin:0 0 8px 0;"><strong>Date:</strong> ${escapeHtml(eventDate)}</p>
      <p style="margin:0 0 8px 0;"><strong>Time:</strong> ${escapeHtml(eventTime)}</p>
    `, theme)}
    ${renderButton('View event details', eventUrl, theme, 'secondary')}
    <p style="margin:16px 0 0 0;font-size:13px;line-height:1.7;color:${theme.mutedTextColor};">See you there, ${escapeHtml(attendeeName)}. Bring this email if check-in is required.</p>
  `;

  const title = `Reminder: ${eventName} is tomorrow`;

  return emailLayout({ content, title, store });
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
  STRIPE_PAYMENT_ID?: string,
  Shipping_Address?: {
    name?: string,
    email?: string,
    street?: string,
    street_2?: string,
    city?: string,
    state?: string,
    country?: string,
    zipcode?: string,
  },
  Details?: Array<{
    Name?: string,
    Quantity?: number
  }>
}, store: { title: string, documentId: string, slug: string }) => {
  console.log('notification:order:store', { order: order?.documentId });
  const theme = resolveTheme(store as Store);

  const formatAddress = (addr?: typeof order.Shipping_Address) => {
    if (!addr) return 'No shipping address provided';
    return [
      addr.name,
      addr.street,
      addr.street_2,
      [addr.city, addr.state, addr.zipcode].filter(Boolean).join(', '),
      addr.country
    ].filter(Boolean).join('\n');
  };

  const customer_email = order?.buyer?.email || order?.Shipping_Address?.email;
  const receiptUrl = `https://de.markket.place/store/${store?.slug}/receipt?session_id=${order?.STRIPE_PAYMENT_ID || ''}`;
  const dashboardUrl = `https://de.markket.place/dashboard/crm?store=${store?.documentId}&order_id=${order?.documentId}#orders`;

  const content = `
    <p style="margin:0 0 14px 0;">A new order just landed in <strong>${escapeHtml(store?.title || 'markket')}</strong>.</p>
    ${renderInfoPanel('Order snapshot', `
      <p style="margin:0 0 8px 0;"><strong>Amount:</strong> ${'$'}${escapeHtml(order?.Amount)} ${escapeHtml(order?.Currency || '')}</p>
      <p style="margin:0 0 8px 0;"><strong>Markket Order ID:</strong> ${escapeHtml(order?.documentId)}</p>
      ${customer_email ? `<p><strong>Email:</strong> ${customer_email}</p>` : ''}

      ${order?.Details && order.Details.length > 0 ? `
        <p style="margin:14px 0 6px 0;"><strong>Items ordered:</strong></p>
        <ul style="margin:0;padding-left:18px;">
          ${order.Details.map(item => `
            <li>${item.Name || 'Unnamed item'}${item.Quantity ? ` × ${item.Quantity}` : ''}</li>
          `).join('')}
        </ul>
      ` : ''}

      ${order?.Shipping_Address ? `
        <p style="margin:14px 0 6px 0;"><strong>Shipping address:</strong></p>
        <pre style="margin:0;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;">${escapeHtml(formatAddress(order.Shipping_Address))}</pre>
      ` : ''}
    `, theme)}
    ${renderButton('View receipt', receiptUrl, theme)}
    ${renderButton('Open dashboard', dashboardUrl, theme, 'secondary')}
    <p style="margin:14px 0 0 0;font-size:13px;line-height:1.7;color:${theme.mutedTextColor};">Session ID: ${escapeHtml(order?.STRIPE_PAYMENT_ID || 'N/A')}</p>
  `;

  const title = 'Markkët: Order notification';

  return emailLayout({ content, title, store: store as Store });
};
