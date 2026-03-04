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
    <p>Welcome to ${storeName || 'Markkët'}.</p>
    <p>${welcomeMessage || 'Thanks for subscribing. We are excited to keep you updated.'}</p>
    <p>If you have questions, contact <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
    ${unsubscribeUrl ? `<p>If you want to unsubscribe, use this link: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a>.</p>` : ''}
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
