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
    <p style="margin:0 0 14px 0;">Welcome to ${storeName || 'Markkët'}.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background:#fff7fb;border:1px dashed #f6c4d8;border-radius:18px;">
      <tr>
        <td style="padding:20px 22px;">
          <div style="font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.4;color:#06b6d4;letter-spacing:1.6px;text-transform:uppercase;font-weight:bold;margin:0 0 10px 0;">Newsletter archive</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;color:#db2777;font-style:italic;margin:0 0 10px 0;">Thanks for subscribing</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1f2340;">
            ${welcomeMessage || 'We are excited to keep you updated with new releases, events, and stories.'}
          </div>
          <div style="margin-top:12px;height:6px;background:#eab308;border-radius:999px;font-size:0;line-height:0;">&nbsp;</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 14px 0;">If you have questions, contact <a href="mailto:${supportEmail}" style="color:#06b6d4;text-decoration:none;">${supportEmail}</a>.</p>
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
    title: `Welcome to ${storeName || 'Markkët'}`,
    content,
    store: {
      title: storeName || 'Markkët',
      slug: 'newsletter',
      documentId: 'newsletter',
      Favicon: {
        url: storeLogoUrl || ''
      },
      settings: {
        email_header_message: `Thanks for joining ${storeName || 'Markkët'}`,
        store_name_override: storeName || 'Markkët',
        welcome_email_text: welcomeMessage || '',
        dashboard_url: '',
        domain: storeDomain || 'https://markket.place'
      }
    }
  });
}
