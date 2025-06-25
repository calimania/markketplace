export default ({ strapi }) => ({
  async request(ctx) {
    const { email, baseUrl } = ctx.request.body;


    if (!email) return ctx.badRequest('Email required');

    const code = await strapi.service('api::auth-magic.auth-magic').generateCode(email);
    await strapi.service('api::auth-magic.auth-magic').sendMagicLink(email, code,);

    ctx.send({ ok: true, url: baseUrl || '' });
  },

  async verify(ctx) {
    const { code } = ctx.request.body;

    if (!code) return ctx.badRequest('CODE_REQUIRED');

    const magic = await strapi.service('api::auth-magic.auth-magic').verifyCode(code);

    if (!magic) return ctx.unauthorized('INVALID_CODE');

    let user = await strapi.query('plugin::users-permissions.user').findOne({ where: { email: magic?.email } });
    const email = magic?.email;

    if (!user && email) {
      user = await strapi.query('plugin::users-permissions.user').create({
        data: { email, username: email }
      });

     await strapi.service('api::auth-magic.auth-magic').welcomeEmail(email);
    }

    const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });
    ctx.send({ jwt, user });
  }
});
