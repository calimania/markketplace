/**
 * url shortner controller
 */

import { factories } from '@strapi/strapi';
import { generateRandomSlug, isValidSlug } from '../services/slug-generator';

const { createCoreController } = factories;

const base_url = process.env.MARKKET_API_URL || 'https://api.markket.place';

export default createCoreController('api::shortner.shortner', ({ strapi }) => ({

  /**
   * POST /api/shortners/create
   * Create a new short URL
   * Body: { url: string, alias?: string, title?: string, description?: string }
   */
  async create(ctx) {
    const { url, alias, title, description } = ctx.request.body.data || ctx.request.body;
    const user = ctx.state.user; // Will be present if authenticated

    if (!url) {
      return ctx.badRequest('URL is required');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return ctx.badRequest('Invalid URL format');
    }

    let finalAlias = alias;

    try {
      // If custom alias provided, validate it
      if (finalAlias) {
        if (!isValidSlug(finalAlias)) {
          return ctx.badRequest('Invalid alias format. Use 3-10 alphanumeric characters.');
        }

        // Check if alias already exists
        const existing = await strapi.documents('api::shortner.shortner').findFirst({
          filters: { alias: finalAlias }
        });

        if (existing) {
          return ctx.badRequest('Alias already exists');
        }
      }

      if (!finalAlias) {
        finalAlias = generateRandomSlug();

        // Check if this random alias already exists (very unlikely but possible)
        let attempts = 0;
        while (attempts < 5) {
          const existing = await strapi.documents('api::shortner.shortner').findFirst({
            filters: { alias: finalAlias }
          });

          if (!existing) break;

          finalAlias = generateRandomSlug();
          attempts++;
        }

        if (attempts >= 5) {
          return ctx.internalServerError('Failed to generate unique alias');
        }
      }

      const data = {
        url,
        alias: finalAlias,
        title,
        description,
        visit: 0,
        ...(user && { user: user.id })
      };

      const shortner = await strapi.documents('api::shortner.shortner').create({
        data
      });

      return ctx.send({
        data: shortner,
        meta: {
          shortUrl: `${ctx.request.origin || base_url}/s/${finalAlias}`,
          message: 'created'
        }
      });

    } catch (error) {
      console.error('Error creating short URL:', error);
      return ctx.internalServerError('Failed to create short URL');
    }
  },

  /**
   * GET /api/shortners/:slug/redirect
   * Redirect to the original URL and increment visit count
   */
  async redirect(ctx) {
    const { slug } = ctx.params;

    try {
      const shortner = await strapi.documents('api::shortner.shortner').findFirst({
        filters: { alias: slug }
      });

      if (!shortner) {
        return ctx.notFound('Short URL not found');
      }

      // Increment visit count
      await strapi.documents('api::shortner.shortner').update({
        documentId: shortner.documentId,
        data: { visit: shortner.visit + 1 }
      });

      // Redirect to the original URL
      ctx.redirect(shortner.url);

    } catch (error) {
      console.error('Error redirecting:', error);
      return ctx.internalServerError('Failed to redirect');
    }
  },

  /**
   * GET /api/shortners/my
   * Get current user's short URLs
   */
  async findMine(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    try {
      const shortners = await strapi.documents('api::shortner.shortner').findMany({
        filters: { user: user.id },
        populate: ['user'],
        sort: { createdAt: 'desc' }
      });


      return ctx.send({
        data: shortners.map(shortner => ({
          ...shortner,
          shortUrl: `${ctx.request.origin || base_url}/s/${shortner.alias}`
        }))
      });

    } catch (error) {
      console.error('Error fetching user shortners:', error);
      return ctx.internalServerError('Failed to fetch short URLs');
    }
  },

/**
 * GET /api/shortners/:documentId/unfurl
 * Get details about a short URL by document ID or alias
 */
  async unfurl(ctx) {
    const { documentId } = ctx.params;

    try {
      // Try to find by document ID first, then by alias
      let shortner = await strapi.documents('api::shortner.shortner').findOne({
        documentId
      });

      if (!shortner) {
        // Try finding by alias
        shortner = await strapi.documents('api::shortner.shortner').findFirst({
          filters: { alias: documentId }
        });
      }

      if (!shortner) {
        return ctx.notFound('Short URL not found');
      }

      return ctx.send({
        data: {
          ...shortner,
          shortUrl: `${ctx.request.origin || base_url}/s/${shortner.alias}`
        }
      });

    } catch (error) {
      console.error('Error unfurling:', error);
      return ctx.internalServerError('Failed to unfurl URL');
    }
  },

  // Override default find to add shortUrl
  async find(ctx) {
    const result = await super.find(ctx);

    if (result.data) {
      result.data = result.data.map(shortner => ({
        ...shortner,
        shortUrl: `${ctx.request.origin || base_url}/s/${shortner.alias}`
      }));
    }

    return result;
  }
}));
