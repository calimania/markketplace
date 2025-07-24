export default ({ env }) => ({
  // Development is currently done in this repo and can be abstracted into plugins for easier sharing
  // 'markketplace': {
  //   enabled: true,
  //   resolve: './src/plugins/markketplace'
  // },
  'get-strapi-schema': {
    enabled: true,
  },
  upload: {
    config: {
      sizeLimit: 4.2 * 1024 * 1024, // 4.20mb in bytes
      provider: "strapi-provider-upload-do",
      providerOptions: {
        key: env('DO_SPACE_ACCESS_KEY'),
        secret: env('DO_SPACE_SECRET_KEY'),
        endpoint: env('DO_SPACE_ENDPOINT'),
        space: env('DO_SPACE_BUCKET'),
        directory: env('DO_SPACE_DIRECTORY'),
        cdn: env('DO_SPACE_CDN'),
      }
    },
  },
  email: {
    config: {
      provider: 'sendgrid',
      providerOptions: {
        apiKey: env('SENDGRID_API_KEY'),
      },
      settings: {
        defaultFrom: env('SENDGRID_FROM_EMAIL'),
        defaultReplyTo: env('SENDGRID_REPLY_TO_EMAIL'),
      },
    },
  },
  healthcheck: {
    enabled: true,
    config: {
      server: {
        uptime: true,
        memory: true,
        version: true,
      },
      database: {
        client: true,
        connections: true,
        uptime: true,
        size: true,
        version: true,
      },
    },
  },
});
