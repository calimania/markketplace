export default {
  config: {
    locales: ['en'],
    menu: {
      logo: '/uploads/markket_logo_small.png',
    },
    tutorials: false,
  },
  bootstrap(/* app */) {
    console.log('[ADMIN] Markketplace admin initialized');
  },
};
