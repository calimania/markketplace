import crypto from 'crypto';
import { AccountCreatedHTML , MagicLinkHTML} from './email.template';

/**
 * Creates a unique code to identify a user connection to an email address
 * Optionally connected to a specific store, for domain validation and custom emails
 */
export default ({ strapi }) => ({
  async generateCode(email: string, store_id?: string) {
    const code = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await strapi.entityService.create('api::auth-magic.magic-code', {
      data: { email, code, expiresAt, store: store_id }
    });

    return code;
  },

  /**
   *
   * @param email
   * @param code
   * @param store
   */
  async sendMagicLink(email: string, code: string, store: any) {

    const url = new URL(`/auth/magic?code=${code}`, store?.settings?.domain || 'https://de.markket.place')?.toString() || '';
    const subject = `${store?.title || 'Markkët'} Magic Login Link`

    await strapi.plugin('email').service('email').send({
      to: email,
      subject,
      text: `Click to login: ${url}`,
      html: MagicLinkHTML(email, url, store),
    });
  },

  /**
   *
   * @param code
   * @returns
   */
  async verifyCode(code: string) {
    const record = await strapi.entityService.findMany('api::auth-magic.magic-code', {
      filters: { code, },
      sort: { createdAt: 'desc' },
      limit: 1,
      populate: ['store.settings', 'store', 'store.Favicon']
    });

    if (!record.length) return null;

    const magic = record[0];

    if (new Date(magic.expiresAt) < new Date()) return null;

    await strapi.entityService.update('api::auth-magic.magic-code', magic.id, { data: { used: true } });

    return magic;
  },
  async welcomeEmail(email: string, store: any) {

    await strapi.plugin('email').service('email').send({
      to: email,
      subject: `Welcome to ${store?.title || 'Markkët'}`,
      text: `Welcome to ${store?.title || 'Markkët'}`,
      html: AccountCreatedHTML(email, store),
    });

    return {};
  }
});
