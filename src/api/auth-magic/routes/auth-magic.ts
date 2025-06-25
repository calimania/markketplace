export default {
  routes: [
    {
      method: 'POST',
      path: '/auth-magic/request',
      handler: 'auth-magic.request',
      config: { auth: false }
    },
    {
      method: 'POST',
      path: '/auth-magic/verify',
      handler: 'auth-magic.verify',
      config: { auth: false }
    }
  ]
};
