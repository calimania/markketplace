export default ({ env }) => ({
  // Development is currently done in this repo and can be abstracted into plugins for easier sharing
  // Extensions allow to interoperate with other useful tools
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
      provider: "aws-s3",
      providerOptions: {
        s3Options: {
          credentials: {
            accessKeyId: env('DO_SPACE_ACCESS_KEY'),
            secretAccessKey: env('DO_SPACE_SECRET_KEY'),
          },
          endpoint: `https://${env('DO_SPACE_ENDPOINT')}`,
          region: 'nyc3', // Digital Ocean region
          forcePathStyle: false, // Digital Ocean Spaces uses virtual hosted-style
          params: {
            Bucket: env('DO_SPACE_BUCKET'),
          },
          upload: {
            ACL: 'public-read',
          },
          uploadPath: env('DO_SPACE_DIRECTORY', 'uploads'),
          baseUrl: env('DO_SPACE_CDN') || `https://${env('DO_SPACE_BUCKET')}.${env('DO_SPACE_ENDPOINT')}`,
        },
      },
    },
  },
  email: {
    config: {
      provider: 'sendgrid',
      providerOptions: {
        apiKey: env('SENDGRID_API_KEY'),
      },
      settings: {
        defaultFrom: env('SENDGRID_FROM_EMAIL', 'noreply@markket.place'),
        defaultReplyTo: env('SENDGRID_REPLY_TO_EMAIL', 'support@markket.place'),
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
  'users-permissions': {
    config: {
      jwt: {
        expiresIn: '8760h',
      },
    },
  },
});
