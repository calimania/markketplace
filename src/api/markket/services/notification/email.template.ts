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
  /** Override the eyebrow/badge label. Pass null to hide entirely. Defaults to store name. */
  label?: string | null;
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
    shellBackground: emailTheme.backgroundColor || branding.backgroundColor || '#fffef5',
    cardBackground: emailTheme.cardBackgroundColor || branding.cardBackgroundColor || '#ffffff',
    panelBackground: emailTheme.panelBackgroundColor || branding.panelBackgroundColor || '#fff7ed',
    textColor: emailTheme.textColor || branding.textColor || '#1f2937',
    mutedTextColor: emailTheme.mutedTextColor || branding.mutedTextColor || '#475569',
    primaryColor: emailTheme.primaryColor || branding.primaryColor || '#ef476f',
    secondaryColor: emailTheme.secondaryColor || branding.secondaryColor || '#06d6a0',
    tertiaryColor: emailTheme.tertiaryColor || branding.tertiaryColor || '#ffd166',
    borderColor: emailTheme.borderColor || branding.borderColor || '#fed7aa',
    inkBackground: emailTheme.inkBackground || branding.inkBackground || '#2b2d42',
    softSecondaryBackground: emailTheme.softSecondaryBackground || branding.softSecondaryBackground || '#ecfeff',
    softTertiaryBackground: emailTheme.softTertiaryBackground || branding.softTertiaryBackground || '#fff7cc',
  };
}

function renderEyebrow(text: string, theme: EmailTheme): string {
  return `<div style="font-family:'Courier New',Courier,monospace;font-size:13px;letter-spacing:1.8px;text-transform:uppercase;color:${theme.primaryColor};font-weight:bold;margin:0 0 12px 0;">${escapeHtml(text)}</div>`;
}

function renderButton(label: string, href: string, theme: EmailTheme, fill: 'primary' | 'secondary' = 'primary'): string {
  const background = fill === 'secondary' ? theme.secondaryColor : theme.primaryColor;
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 8px 0;">
      <tr>
        <td bgcolor="${background}" style="border-radius:999px;">
          <a class="mk-btn" href="${href}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.6px;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
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
export const emailLayout = ({ content, title, store, label }: EmailLayout) => {
  const logoUrl = store?.Favicon?.url;
  const preheader = store?.settings?.email_header_message || `Thank you for using ${store?.title || 'Markkët'}!`;
  const storeName = store?.settings?.store_name_override || store?.title || 'Markkët';
  const storeUrl = store?.settings?.domain || 'https://markket.place';
  const footerText = store?.settings?.email_footer || `Visit ${storeName} for more updates.`;
  const theme = resolveTheme(store);
  // label=undefined → use storeName; label=null → hide badge/eyebrow; label=string → use that string
  const resolvedLabel = label === undefined ? storeName : label;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>${title} - ${storeName}</title>
      <style>
        body {
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
        }
        @media (max-width: 600px) {
          .mk-shell {
            padding: 18px 10px !important;
          }
          .mk-card-pad {
            padding: 20px 18px 12px 18px !important;
          }
          .mk-header-pad {
            padding: 20px 18px 14px 18px !important;
          }
          .mk-footer-pad {
            padding: 0 18px 20px 18px !important;
          }
          .mk-brand {
            font-size: 34px !important;
          }
          .mk-title {
            font-size: 30px !important;
          }
          .mk-content {
            font-size: 16px !important;
            line-height: 1.7 !important;
          }
          .mk-btn {
            display: block !important;
            padding: 14px 18px !important;
            font-size: 15px !important;
            text-align: center !important;
          }
        }
        @media (prefers-color-scheme: dark) {
          body,
          .mk-bg {
            background-color: ${theme.shellBackground} !important;
          }
        }
      </style>
    </head>
    <body style="margin:0;padding:0;background:${theme.shellBackground};color:${theme.textColor};font-family:Arial,Helvetica,sans-serif;">
      <span style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</span>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="mk-bg" style="background:${theme.shellBackground};">
        <tr>
          <td align="center" class="mk-shell" style="padding:28px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;margin:0 auto;">
              <tr>
                <td style="padding:0 0 14px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:0 2px 14px 2px;">
                        ${resolvedLabel !== null ? renderEyebrow(resolvedLabel, theme) : ''}
                        <div class="mk-brand" style="font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:0.95;color:${theme.textColor};font-weight:bold;letter-spacing:-1px;">${escapeHtml(storeName)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.cardBackground};border:1px solid ${theme.borderColor};border-radius:26px;">
                    <tr>
                      <td bgcolor="${theme.inkBackground}" class="mk-header-pad" style="padding:26px 28px 18px 28px;border-radius:26px 26px 0 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td valign="top" style="padding:0 12px 0 0;">
                              ${logoUrl ? `<img src="${logoUrl}" alt="${escapeHtml(storeName)} logo" style="display:block;height:48px;max-width:160px;border:0;outline:none;text-decoration:none;">` : ''}
                            </td>
                            <td align="right" valign="top">
                              ${resolvedLabel !== null ? `<div style="display:inline-block;padding:7px 14px;background:${theme.primaryColor};border-radius:999px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.2;color:#ffffff;letter-spacing:1.2px;text-transform:uppercase;font-weight:bold;">${escapeHtml(resolvedLabel)}</div>` : ''}
                              <div style="padding-top:10px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.6;color:${theme.softTertiaryBackground};letter-spacing:1.2px;text-transform:uppercase;">
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
                      <td class="mk-card-pad" style="padding:26px 28px 14px 28px;">
                        <div class="mk-title" style="font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.05;color:${theme.textColor};font-style:italic;margin:0 0 14px 0;">${escapeHtml(title)}</div>
                        <div class="mk-content" style="font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.8;color:${theme.textColor};">${content || ''}</div>
                      </td>
                    </tr>
                    <tr>
                      <td class="mk-footer-pad" style="padding:0 28px 26px 28px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${theme.borderColor};">
                          <tr>
                            <td style="padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:${theme.mutedTextColor};">
                              ${escapeHtml(footerText)}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-top:10px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.6;color:${theme.mutedTextColor};letter-spacing:1.2px;text-transform:uppercase;">
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
    <p style="margin:0 0 6px 0;font-size:20px;line-height:1.3;">&#127873; Order received!</p>
    <p style="margin:0 0 14px 0;">Thank you for your purchase. Your receipt is ready and the seller has already been notified.</p>
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

function safeTimezone(tz: any): string | undefined {
  if (!tz || typeof tz !== 'string') {
    return undefined;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

function formatEventDate(value: any, timezone?: any): string {
  if (!value) {
    return 'To be announced';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const tz = safeTimezone(timezone);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(tz ? { timeZone: tz } : {}),
  });
}

function formatEventTimeRange(start: any, end: any, timezone?: any): string {
  if (!start && !end) {
    return 'To be announced';
  }

  const tz = safeTimezone(timezone);

  const formatTime = (value: any) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value || '');
    }

    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...(tz ? { timeZone: tz } : {}),
    });
  };

  const startLabel = formatTime(start);
  const endLabel = end ? formatTime(end) : '';
  const tzLabel = tz ? ` (${tz.replace(/_/g, '\u00a0')})` : '';
  return endLabel ? `${startLabel} - ${endLabel}${tzLabel}` : `${startLabel}${tzLabel}`;
}

export function maskEmail(value: any): string {
  const email = String(value || '').trim();
  const atIndex = email.indexOf('@');
  if (!email || atIndex <= 0) {
    return 'Hidden';
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const visibleLocal = local.length <= 2 ? local.charAt(0) : local.slice(0, 2);
  return `${visibleLocal}${'*'.repeat(Math.max(3, local.length - visibleLocal.length))}@${domain}`;
}

/**
 * RSVP Notification Email Template
 */
export const RSVPNotificationHTml = ({ rsvp, event, store }: { rsvp: any; event: any; store?: any }) => {
  const theme = resolveTheme(store);
  const calendarUrl = event?.calendarUrl || event?.data?.object?.calendarUrl || '';
  const attendeeName = rsvp?.name || rsvp?.user?.displayName || rsvp?.email || 'friend';
  const eventName = event?.Name || event?.title || 'Upcoming event';
  const eventTimezone = event?.timezone || null;
  const eventDate = formatEventDate(event?.startDate, eventTimezone);
  const eventTime = formatEventTimeRange(event?.startDate, event?.endDate, eventTimezone);
  const attendeeEmail = maskEmail(rsvp?.email);
  const storeDomain = String(store?.settings?.domain || 'https://markket.place').replace(/\/$/, '');
  const rsvpDocumentId = String(rsvp?.documentId || '').trim();
  const rsvpUrl = rsvpDocumentId
    ? `${storeDomain}/rsvp?id=${encodeURIComponent(rsvpDocumentId)}`
    : `${storeDomain}/rsvp`;

  const content = `
    <p style="margin:0 0 6px 0;font-size:22px;line-height:1.3;">&#127881; You're going, ${escapeHtml(attendeeName)}!</p>
    <p style="margin:0 0 18px 0;">Your spot at <strong>${escapeHtml(eventName)}</strong> is confirmed. Here are your details &mdash; save this email or open it at check-in.</p>
    ${renderInfoPanel('Event details', `
      <p style="margin:0 0 8px 0;">&#128197; <strong>Date:</strong> ${escapeHtml(eventDate)}</p>
      <p style="margin:0 0 8px 0;">&#128336; <strong>Time:</strong> ${escapeHtml(eventTime)}</p>
      <p style="margin:0;">&#128231; <strong>Registered as:</strong> ${escapeHtml(attendeeEmail)}</p>
    `, theme)}
    ${renderButton('&#127918; View my RSVP', rsvpUrl, theme)}
    ${calendarUrl ? renderButton('&#128197; Add to calendar', calendarUrl, theme, 'secondary') : ''}
    <p style="margin:18px 0 0 0;font-size:13px;line-height:1.7;color:${theme.mutedTextColor};">Can't wait to see you there. &#10024; Bring this email if check-in is required.</p>
  `;

  const title = 'You\'re in! &#127881; RSVP confirmed';

  return emailLayout({ content, title, store });
};

/**
 * Event Reminder Email Template
 * Sent to each approved RSVP attendee ~24h before the event starts.
 */
export const EventReminderEmailHtml = ({ event, store, rsvp }: { event: any; store?: any; rsvp?: any }) => {
  const theme = resolveTheme(store);
  const attendeeName = rsvp?.name || rsvp?.email ? maskEmail(rsvp?.email) : 'friend';
  const eventName = event?.Name || event?.title || 'Upcoming event';
  const eventTimezone = event?.timezone || null;
  const eventDate = formatEventDate(event?.startDate, eventTimezone);
  const eventTime = formatEventTimeRange(event?.startDate, event?.endDate, eventTimezone);
  const storeDomain = String(store?.settings?.domain || 'https://markket.place').replace(/\/$/, '');
  const eventSlug = event?.slug || event?.documentId || '';
  const eventUrl = eventSlug ? `${storeDomain}/events/${eventSlug}` : storeDomain;
  const rsvpDocumentId = String(rsvp?.documentId || '').trim();
  const rsvpUrl = rsvpDocumentId ? `${storeDomain}/rsvp?id=${encodeURIComponent(rsvpDocumentId)}` : null;

  const content = `
    <p style="margin:0 0 6px 0;font-size:20px;line-height:1.3;">&#9889; See you tomorrow, ${escapeHtml(attendeeName)}!</p>
    <p style="margin:0 0 14px 0;">Just a heads-up &mdash; <strong>${escapeHtml(eventName)}</strong> is happening tomorrow. Here are your details.</p>
    ${renderInfoPanel('Event details', `
      <p style="margin:0 0 8px 0;">&#128197; <strong>Date:</strong> ${escapeHtml(eventDate)}</p>
      <p style="margin:0 0 8px 0;">&#128336; <strong>Time:</strong> ${escapeHtml(eventTime)}</p>
    `, theme)}
    ${rsvpUrl ? renderButton('&#127918; View my RSVP', rsvpUrl, theme) : renderButton('View event details', eventUrl, theme, 'secondary')}
    <p style="margin:16px 0 0 0;font-size:13px;line-height:1.7;color:${theme.mutedTextColor};">&#10024; Bring this email if check-in is required.</p>
  `;

  const title = `&#9889; Tomorrow: ${eventName}`;

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
