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

  const content = `
    <p style="margin:0 0 18px 0;font-size:20px;line-height:1.3;">&#127881; You're in!</p>
    <p style="margin:0 0 18px 0;">${welcomeMessage || `We&rsquo;re excited to keep you in the loop with new releases, events, and stories from <strong>${storeName || 'Markkët'}</strong>.`}</p>
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
    title: `You're subscribed &#127881;`,
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
