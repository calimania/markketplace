/**
 * Auth magic with email link
 *
 * Uses store.settings records for email customization and redirect domain
 */
export default ({ strapi }) => ({
  async request(ctx) {
    const { email, store_id } = ctx.request.body;

    if (!email) return ctx.badRequest('Email required');

    const code = await strapi.service('api::auth-magic.auth-magic').generateCode(email, store_id);

    const store = await strapi.service('api::store.store').findOne(store_id, {
      populate: ['Favicon', 'settings']
    });

    await strapi.service('api::auth-magic.auth-magic').sendMagicLink(email, code, store);

    ctx.send({ ok: true, domain: store?.settings?.domain });
  },

  async verify(ctx) {
    const { code } = ctx.request.body;

    if (!code) return ctx.badRequest('CODE_REQUIRED');

    const magic = await strapi.service('api::auth-magic.auth-magic').verifyCode(code);

    if (!magic) return ctx.unauthorized('INVALID_CODE');

    let user = await strapi.query('plugin::users-permissions.user').findOne({ where: { email: magic?.email } });
    const email = magic?.email;

    if (!user && email) {
      const role = await strapi.db.query('plugin::users-permissions.role').findOne({
        where: { name: 'Store Owners' },
      });

      user = await strapi.query('plugin::users-permissions.user').create({
        data: { email, username: email, confirmed: true, role: role.id }
      });

      console.info('new:user', { id: user.id, role: role.id });
      await strapi.service('api::auth-magic.auth-magic').welcomeEmail(email, magic?.store);
    }

    const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });
    ctx.send({ jwt, user });
  }
});
