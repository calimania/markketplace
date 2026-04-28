/** Markket notification.emails includes utilities for design consistency and possible abstraction */
import { emailLayout, Store } from '../../markket/services/notification/email.template';

/**
 * Magic Link Email Template - same code for register or login
 */
export const MagicLinkHTML = (email: string, url: string, store: any) => {
  const accent = store?.settings?.email_theme?.primaryColor || store?.settings?.branding?.primaryColor || '#db2777';
  const secondary = store?.settings?.email_theme?.secondaryColor || store?.settings?.branding?.secondaryColor || '#06b6d4';
  const tertiary = store?.settings?.email_theme?.tertiaryColor || store?.settings?.branding?.tertiaryColor || '#eab308';
  const content = `
    <p style="margin:0 0 14px 0;">Hi <strong>${email}</strong>, use the secure link below to continue.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background:#fff7fb;border:1px dashed ${accent};border-radius:18px;">
      <tr>
        <td style="padding:20px 22px;">
          <div style="font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.4;color:${secondary};letter-spacing:1.6px;text-transform:uppercase;font-weight:bold;margin:0 0 10px 0;">Secure access sequence</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;color:${accent};font-style:italic;margin:0 0 10px 0;">Magic login link</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1f2340;">
            This link stays valid for 15 minutes. If you did not request it, you can safely ignore this email.
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 8px 0;">
            <tr>
              <td bgcolor="${accent}" style="border-radius:999px;">
                <a href="${url}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.6px;color:#ffffff;text-decoration:none;border-radius:999px;">Continue</a>
              </td>
            </tr>
          </table>
          <div style="margin-top:12px;height:6px;background:${tertiary};border-radius:999px;font-size:0;line-height:0;">&nbsp;</div>
          <div style="font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.7;color:${secondary};word-break:break-all;margin-top:12px;">${url}</div>
        </td>
      </tr>
    </table>
  `;
  const title = `${store?.title || 'Markkët'} Magic Login Link`;
  return emailLayout({ content, title, store, label: 'Secure sign in' });
};

/**
 * Account Created Notification - first time users of magic link
 */
export const AccountCreatedHTML = (email: string, store: Store) => {
  const accent = store?.settings?.email_theme?.tertiaryColor || store?.settings?.branding?.tertiaryColor || '#eab308';
  const dashboardUrl = store?.settings?.dashboard_url || new URL('/dashboard', store?.settings?.domain || 'https://de.markket.place/').toString();
  const customWelcome = store?.settings?.welcome_email_text;
  const content = `
    <p style="margin:0 0 18px 0;font-size:20px;line-height:1.3;">🎉 You're in!</p>
    <p style="margin:0 0 14px 0;">Hi <strong>${email}</strong> — your account is ready.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background:#fff9e8;border:1px dashed ${accent};border-radius:18px;">
      <tr>
        <td style="padding:20px 22px;">
          <div style="font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.4;color:#db2777;letter-spacing:1.6px;text-transform:uppercase;font-weight:bold;margin:0 0 10px 0;">Studio unlocked</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1f2340;">
            ${customWelcome || 'Web publishing platform for nice people. Start by creating a store and adding some pictures.'}
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 0 0;">
            <tr>
              <td bgcolor="#1f2340" style="border-radius:999px;">
                <a href="${dashboardUrl}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.6px;color:#ffffff;text-decoration:none;border-radius:999px;">Open dashboard</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 0 0;font-size:13px;color:#6b7280;">Questions? Reach us at <a href="mailto:markket@caliman.org" style="color:#06b6d4;text-decoration:none;">markket@caliman.org</a>.</p>
  `;
  const title = `Welcome to ${store?.title || 'Markkët'}! 🎉`;
  return emailLayout({ content, title, store });
};
