/**
 * Short URL redirect middleware
 * Handles /s/:slug routes at the root level
 * Serves SEO-friendly HTML for bots, redirects for humans
 */
import { generateSEOHTML } from "./template";

const DEFAULT_STORE_SLUG = process.env.MARKKET_STORE_SLUG || 'next';

// Bot user agents for SEO preview detection
const BOT_USER_AGENTS = [
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'slackbot',
  'discordbot',
  'googlebot',
  'bingbot',
  'applebot',
  'meta-externalagent',
  'instagram'
] as const;

const isBotRequest = (userAgent: string): boolean => {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot));
};

interface StrapiContext {
  path: string;
  headers: Record<string, string>;
  status: number;
  body: any;
  set: (key: string, value: string) => void;
  redirect: (url: string) => void;
}

export default (config: any, { strapi }: any) => {
  return async (ctx: StrapiContext, next: any) => {
    // Check if the request is for a short URL
    const shortUrlMatch = ctx.path.match(/^\/s\/([a-zA-Z0-9]+)$/);

    if (shortUrlMatch) {
      const slug = shortUrlMatch[1];
      const userAgent = ctx.headers['user-agent'] || '';
      const isBot = isBotRequest(userAgent);

      try {
        // Find the shortner by alias with populated relations including store SEO
        const shortner = await strapi.documents('api::shortner.shortner').findFirst({
          filters: { alias: slug },
          populate: {
            image: true,
            store: {
              populate: ['SEO', 'settings', 'Favicon']
            }
          }
        });

        if (!shortner) {
          ctx.status = 404;
          ctx.body = { error: 'Short URL not found' };
          return;
        }

        // Get store with SEO settings - use associated store or fallback to default
        let store = shortner.store;
        if (!store) {
          // Fallback to default store
          const stores = await strapi.documents('api::store.store').findMany({
            filters: { slug: DEFAULT_STORE_SLUG },
            populate: ['SEO', 'settings', 'Favicon'],
            limit: 1
          });
          store = stores && stores.length > 0 ? stores[0] : null;
        }

        if (isBot) {
          console.log(`Bot requests short URL: ${slug} -> SEO preview (UA: ${userAgent.substring(0, 50)}...)`);
          ctx.set('Content-Type', 'text/html; charset=utf-8');
          ctx.status = 200;
          ctx.body = generateSEOHTML(shortner, store);
          return;
        } else {
          await strapi.documents('api::shortner.shortner').update({
            documentId: shortner.documentId,
            data: { visit: shortner.visit + 1 }
          });

          console.log(`Short URL redirect: ${slug} -> ${shortner.url} (visits: ${shortner.visit + 1})`);

          ctx.redirect(shortner.url);
          return;
        }

      } catch (error) {
        console.error('Error in short URL middleware:', error);
        ctx.status = 500;
        ctx.body = { error: 'Internal server error' };
        return;
      }
    }

    await next();
  };
};
