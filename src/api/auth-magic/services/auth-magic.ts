import crypto from 'crypto';
import { AccountCreatedHTML , MagicLinkHTML} from './email.template';

export default ({ strapi }) => ({
  async generateCode(email: string) {
    const code = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await strapi.entityService.create('api::auth-magic.magic-code', {
      data: { email, code, expiresAt }
    });
    return code;
  },

  async sendMagicLink(email: string, code: string, baseUrl?: string) {

    // @TODO: dynamic url later - will verify JWT
    const url = `${baseUrl || 'https://de.markket.place'}/auth/magic?code=${code}`;

    await strapi.plugin('email').service('email').send({
      to: email,
      subject: 'Markkët Magic Login Link',
      text: `Click to login: ${url}`,
      html: MagicLinkHTML(email, url),
    });
  },

  async verifyCode(code: string) {
    const record = await strapi.entityService.findMany('api::auth-magic.magic-code', {
      filters: { code, },
      sort: { createdAt: 'desc' },
      limit: 1
    });

    if (!record.length) return null;

    const magic = record[0];

    if (new Date(magic.expiresAt) < new Date()) return null;

    await strapi.entityService.update('api::auth-magic.magic-code', magic.id, { data: { used: true } });

    return magic;
  },
  async welcomeEmail  (email: string) {

    await strapi.plugin('email').service('email').send({
      to: email,
      subject: 'Welcome to Markkët',
      text: `Welcome to Markkët`,
      html: AccountCreatedHTML(email),
    });

    return {};
  }
});
