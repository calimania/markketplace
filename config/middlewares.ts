export default [
  'strapi::logger',
  'strapi::errors',
  'global::short-url', // Custom middleware for /s/:slug redirects
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:'],
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            '*.digitaloceanspaces.com',
          ],
          'media-src': [
            "'self'",
            'data:',
            'blob:',
            '*.digitaloceanspaces.com',
          ],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
