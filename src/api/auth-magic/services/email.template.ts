/** Markket notification.emails includes utilities for design consistency and possible abstraction */
import { emailLayout, Store } from '../../markket/services/notification/email.template';

/**
 * Magic Link Email Template - same code for register or login
 */
export const MagicLinkHTML = (email: string, url: string, store: any) => {
  const content = `
    <div style="background:#fffbe7;border:2.5px solid #ff00cf;padding:22px 14px 16px 14px;border-radius:12px;">
      <h3 style="font-size:1.3rem;color:#ff00cf;font-weight:900;margin-bottom:16px;letter-spacing:1px;">
        Bienvenido a Markkët
      </h3>
      <p style="font-size:1.1rem;margin-bottom:14px;">
        Hey <span style="color:#0057ad;font-weight:700;">${email}</span>!
      </p>
      <a href="${url}" style="display:inline-block;background:#ff00cf;color:#fff;font-weight:900;padding:13px 26px;border-radius:8px;text-decoration:none;font-size:1.1rem;margin-bottom:16px;box-shadow:0 2px 8px #ff00cf33;letter-spacing:1px;">
        Continue
      </a>
      <p style="margin-top:18px;color:#666;font-size:0.95rem;">
        Valid for 15 minutes. If you didn't request this, you can ignore this email.
      </p>
      <p style="margin-top:18px;color:#666;font-size:0.95rem;">
        ${url}
      </p>
    </div>
  `;
  const title = 'Your Magic Login Link';
  return emailLayout({ content, title, store });
};

/**
 * Account Created Notification - first time users of magic link
 */
export const AccountCreatedHTML = (email: string, store: Store) => {
  const content = `
    <div style="background:#fffbe7;border:2.5px solid #fbda0d;padding:22px 14px 16px 14px;border-radius:12px;text-align:left;">
      <h3 style="font-size:1.3rem;color:#0057ad;font-weight:900;margin-bottom:16px;letter-spacing:1px;">
        Your account is ready!
      </h3>
      <p style="font-size:1.1rem;margin-bottom:14px;">Hi <span style="color:#ff00cf;font-weight:700;">${email}</span>!</p>
      <p style="color:#222;font-size:1rem;margin-bottom:0;">
      ${store?.settings?.welcome_email_text || 'Markkët helps webmasters'}.
        Visit your
        <a href="${store?.settings?.dashboard_url || 'Markkët helps webmasters'}">dashboard</a> to explore features.
      </p>
    </div>
  `;
  const title = 'Welcome to Markkët!';
  return emailLayout({ content, title, store });
};
