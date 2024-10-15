/**
 * `populate-store` middleware
 */

import { Strapi } from '@strapi/strapi';

const populate = {
  populate: {
    Logo: {
      fields: ["url", "alternativeText", "name", "width", "height"],
    },
    articles: {
      populate: {
        cover: {
          fields: ["url", "alternativeText", "name", "width", "height"],
        },
        SEO: {
          populate: {
            socialImage: {
              fields: ["url", "alternativeText", "name", "width", "height"],
            },
          }
        },
        Tags: {
          fields: ["Label", "Color"],
        },
        category: {
          populate: {
            SEO: {
              fields: ["metaTitle", "metaDescription"],
            },
          },
        },
        Content: {
          on: {
            "shared.media": {
              populate: {
                file: {
                  fields: ["url", "alternativeText", "name", "width", "height"],
                },
              },
            },

            "shared.slider": {
              populate: {
                files: {
                  fields: ["url", "alternativeText", "name", "width", "height"],
                },
              },
            },

            "shared.quote": {
              populate: true,
            },

            "shared.rich-text": {
              populate: true,
            },
          },
        },
      }
    },
  },
};

export default (config, { strapi }: { strapi: Strapi }) => {

  return async (ctx, next) => {
    // @TODO: temporary - it requests all the articles in a store to display in .astro front end
    if (ctx?.originalUrl?.includes("append_all")) {
      ctx.query = {
        ...ctx.query,
        ...populate,
      };
    }

    await next();

  };
};
