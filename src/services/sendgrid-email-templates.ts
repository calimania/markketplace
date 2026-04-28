import { emailLayout } from '../api/markket/services/notification/email.template';

interface BuildWelcomeEmailHtmlInput {
  storeName?: string;
  storeDomain?: string;
  storeLogoUrl?: string;
  welcomeMessage?: string;
  supportEmail?: string;
  unsubscribeUrl?: string;
}

export function buildWelcomeEmailHtml(input: BuildWelcomeEmailHtmlInput): string {
  const {
    storeName,
    storeDomain,
    storeLogoUrl,
    welcomeMessage,
    supportEmail = 'support@markket.place',
    unsubscribeUrl,
  } = input;

  const defaultWelcomeMessage = welcomeMessage || `You'll receive occasional emails with new blog posts, products, and updates from <strong>${storeName || 'Markkët'}</strong>. We'll keep it worth your time.`;

  const content = `
    <p style="margin:0 0 18px 0;font-size:20px;line-height:1.3;">🎉 You're in!</p>
    <p style="margin:0 0 8px 0;font-weight:600;">Subscribed to ${storeName || 'Markkët'} updates</p>
    <p style="margin:0 0 18px 0;">${defaultWelcomeMessage}</p>
    ${!storeName ? `<p style="margin:0 0 18px 0;font-size:14px;color:#6b7280;">Web publishing platform for nice people. Start by creating a store and adding some pictures.</p>` : ''}
    <p style="margin:0 0 14px 0;font-size:14px;color:#6b7280;">Questions? Reach us at <a href="mailto:${supportEmail}" style="color:#06b6d4;text-decoration:none;">${supportEmail}</a>.</p>
    ${unsubscribeUrl ? `
      <p style="margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#6b7280;">If you ever want to unsubscribe, use the link below.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px 0;">
        <tr>
          <td bgcolor="#db2777" style="border-radius:999px;">
            <a href="${unsubscribeUrl}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;">Manage subscription</a>
          </td>
        </tr>
      </table>
    ` : ''}
  `;

  return emailLayout({
    title: `You're subscribed 🎉`,
    content,
    store: {
      title: storeName || 'Markkët',
      slug: 'newsletter',
      documentId: 'newsletter',
      Favicon: {
        url: storeLogoUrl || ''
      },
      settings: {
        email_header_message: `Welcome! You're now subscribed to ${storeName || 'Markkët'}`,
        store_name_override: storeName || 'Markkët',
        welcome_email_text: welcomeMessage || '',
        dashboard_url: '',
        domain: storeDomain || 'https://markket.place'
      }
    }
  });
}
