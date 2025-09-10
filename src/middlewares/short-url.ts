/**
 * Short URL redirect middleware
 * Handles /s/:slug routes at the root level
 */

export default (config: any, { strapi }: any) => {
  return async (ctx: any, next: any) => {
    // Check if the request is for a short URL
    const shortUrlMatch = ctx.path.match(/^\/s\/([a-zA-Z0-9]+)$/);

    if (shortUrlMatch) {
      const slug = shortUrlMatch[1];

      try {
        // Find the shortner by alias
        const shortner = await strapi.documents('api::shortner.shortner').findFirst({
          filters: { alias: slug }
        });

        if (!shortner) {
          ctx.status = 404;
          ctx.body = { error: 'Short URL not found' };
          return;
        }

        // Increment visit count
        await strapi.documents('api::shortner.shortner').update({
          documentId: shortner.documentId,
          data: { visit: shortner.visit + 1 }
        });

        // Log the redirect for analytics
        console.log(`🔗 Short URL redirect: ${slug} -> ${shortner.url} (visits: ${shortner.visit + 1})`);

        // Perform the redirect
        ctx.redirect(shortner.url);
        return;

      } catch (error) {
        console.error('Error in short URL middleware:', error);
        ctx.status = 500;
        ctx.body = { error: 'Internal server error' };
        return;
      }
    }

    // If not a short URL, continue to next middleware
    await next();
  };
};
