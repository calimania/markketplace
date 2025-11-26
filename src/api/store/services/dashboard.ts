/**
 * Store Dashboard Service
 *
 * Efficient aggregation of store metrics for dashboard display
 * Handles both content counts and sales analytics
 */

interface ContentCounts {
  articles: number;
  pages: number;
  events: number;
  products: number;
}

interface SalesSummary {
  total_revenue_cents: number;
  total_revenue_usd: string;
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_platform_fees_cents: number;
  total_platform_fees_usd: string;
  total_stripe_fees_cents: number;
  total_stripe_fees_usd: string;
  estimated_payout_cents: number;
  estimated_payout_usd: string;
}

interface RecentOrder {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  customer_email?: string;
}

/**
 * Get content counts for a store
 */
export async function getContentCounts(storeId: string): Promise<ContentCounts> {
  const [articles, pages, events, products] = await Promise.all([
    strapi.documents('api::article.article').count({
      filters: { store: { documentId: storeId } }
    }),
    strapi.documents('api::page.page').count({
      filters: { store: { documentId: storeId } }
    }),
    strapi.documents('api::event.event').count({
      filters: { stores: { documentId: storeId } }
    }),
    strapi.documents('api::product.product').count({
      filters: { stores: { documentId: storeId } }
    }),
  ]);

  return {
    articles,
    pages,
    events,
    products,
  };
}

/**
 * Get sales summary for a store
 */
export async function getSalesSummary(storeId: string, daysBack: number = 30): Promise<SalesSummary> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const orders = await strapi.db.query('api::order.order').findMany({
    where: {
      store: { documentId: storeId },
      createdAt: { $gte: since.toISOString() },
    },
    select: ['Amount', 'Status', 'extra'],
  });

  let totalRevenue = 0;
  let totalPlatformFees = 0;
  let totalStripeFees = 0;
  let pending = 0;
  let completed = 0;

  for (const order of orders) {
    const amountCents = Math.round(order.Amount * 100);
    totalRevenue += amountCents;

    if (order.Status === 'pending') pending++;
    if (order.Status === 'completed' || order.Status === 'paid') completed++;

    const extra = order.extra as Record<string, any>;
    if (extra?.stripe_estimated_fees) {
      totalPlatformFees += extra.stripe_estimated_fees.platform_fee_cents || 0;
      totalStripeFees += extra.stripe_estimated_fees.stripe_fee_cents || 0;
    } else if (extra?.stripe_actual_fees) {
      totalStripeFees += extra.stripe_actual_fees.fees_cents || 0;
    }
  }

  const estimatedPayout = totalRevenue - totalPlatformFees - totalStripeFees;

  return {
    total_revenue_cents: totalRevenue,
    total_revenue_usd: (totalRevenue / 100).toFixed(2),
    total_orders: orders.length,
    pending_orders: pending,
    completed_orders: completed,
    total_platform_fees_cents: totalPlatformFees,
    total_platform_fees_usd: (totalPlatformFees / 100).toFixed(2),
    total_stripe_fees_cents: totalStripeFees,
    total_stripe_fees_usd: (totalStripeFees / 100).toFixed(2),
    estimated_payout_cents: estimatedPayout,
    estimated_payout_usd: (estimatedPayout / 100).toFixed(2),
  };
}

/**
 * Get recent orders for a store
 */
export async function getRecentOrders(storeId: string, limit: number = 10): Promise<RecentOrder[]> {
  const orders = await strapi.db.query('api::order.order').findMany({
    where: { store: { documentId: storeId } },
    orderBy: { createdAt: 'desc' },
    limit,
    select: ['documentId', 'Amount', 'Status', 'createdAt'],
  });

  return orders.map(order => ({
    id: order.documentId,
    amount: order.Amount,
    status: order.Status,
    created_at: order.createdAt,
  }));
}

/**
 * Get complete dashboard data in a single call
 */
export async function getDashboardData(storeId: string) {
  const [contentCounts, salesSummary, recentOrders] = await Promise.all([
    getContentCounts(storeId),
    getSalesSummary(storeId, 30),
    getRecentOrders(storeId, 5),
  ]);

  return {
    content: contentCounts,
    sales: salesSummary,
    recent_orders: recentOrders,
  };
}

/**
 * Get Stripe Connect status for UI badges
 */
export async function getStripeStatus(storeId: string) {
  const store = await strapi.documents('api::store.store').findOne({
    documentId: storeId
  });

  if (!store?.STRIPE_CUSTOMER_ID) {
    return {
      connected: false,
      status: 'not_connected',
      message: 'Connect your Stripe account to receive payments'
    };
  }

  try {
    const { getAccount } = require('../../markket/services/stripe');
    const account = await getAccount(storeId);

    return {
      connected: true,
      charges_enabled: account?.charges_enabled || false,
      payouts_enabled: account?.payouts_enabled || false,
      status: (account?.charges_enabled && account?.payouts_enabled) ? 'active' : 'pending',
      message: (account?.charges_enabled && account?.payouts_enabled)
        ? 'Stripe account active'
        : 'Complete Stripe onboarding to accept payments'
    };
  } catch (error) {
    return {
      connected: true,
      status: 'error',
      message: 'Error fetching Stripe status'
    };
  }
}

/**
 * Get recent activity timeline
 */
export async function getRecentActivity(storeId: string, limit: number = 10) {
  const [recentArticles, recentOrders] = await Promise.all([
    strapi.documents('api::article.article').findMany({
      filters: { store: { documentId: storeId } },
      sort: 'createdAt:desc',
      limit: 5,
    }),
    strapi.documents('api::order.order').findMany({
      filters: { store: { documentId: storeId } },
      sort: 'createdAt:desc',
      limit: 5,
    }),
  ]);

  const activities = [
    ...recentArticles.map(a => ({
      type: 'article',
      id: a.documentId,
      title: a.Title || 'Untitled',
      timestamp: a.createdAt,
    })),
    ...recentOrders.map(o => ({
      type: 'order',
      id: o.documentId,
      amount: o.Amount,
      status: o.Status,
      timestamp: o.createdAt,
    })),
  ];

  return activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * Get quick stats for homepage hero
 * PUBLIC endpoint - no sensitive sales data
 * or a page with the correct slug has been created
 */
export async function getQuickStats(storeId: string) {
  const counts = await getContentCounts(storeId);

  return {
    total_content: counts.articles + counts.pages + counts.events,
    total_products: counts.products,
    has_content: (counts.articles + counts.pages) > 0,
    has_products: counts.products > 0,
    has_events: counts.events > 0,
  };
}

/**
 * Magic slugs that control navigation visibility
 * Store can create pages with these slugs to enable sections
 */
const MAGIC_SLUGS = {
  about: ['about', 'acerca', 'sobre', 'nosotros'],
  blog: ['blog', 'articles', 'articulos', 'noticias'],
  shop: ['products', 'shop', 'tienda', 'catalogo'],
  events: ['events', 'eventos', 'calendario'],
  newsletter: ['newsletter', 'subscribe', 'suscribirse'],
  home: ['home', 'inicio', 'portada'],
};

/**
 * Get UI visibility flags for conditional rendering
 *
 * Priority system:
 * 1. Store settings override (settings.meta.navigation.show_*)
 * 2. Magic page slugs (page exists = show button)
 * 3. Content existence (has articles = show blog)
 *
 * Smart homepage navigation for de.markket.place/store/:slug
 */
export async function getVisibilityFlags(storeId: string) {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));

  const [counts, store, magicPages, upcomingEvents] = await Promise.all([
    getContentCounts(storeId),
    strapi.documents('api::store.store').findOne({
      documentId: storeId,
      populate: ['settings'],
    }),
    strapi.documents('api::page.page').findMany({
      filters: {
        store: { documentId: storeId },
        Active: true,
        slug: {
          $in: Object.values(MAGIC_SLUGS).flat()
        },
      },
      fields: ['slug'],
    }),
    strapi.documents('api::event.event').count({
      filters: {
        stores: { documentId: storeId },
        $or: [
          {
            endDate: { $gte: now.toISOString() }
          },
          {
            $and: [
              { startDate: { $gte: twoDaysAgo.toISOString() } }
            ]
          },
        ]
      }
    }),
  ]);

  const settings = (store?.settings || {}) as Record<string, any>;
  const navigationSettings = settings?.meta?.navigation || {};

  const foundSlugs = new Set(
    magicPages.map((p: any) => p.slug?.toLowerCase()).filter(Boolean)
  );

  const hasAboutPage = MAGIC_SLUGS.about.some(slug => foundSlugs.has(slug));
  const hasBlogPage = MAGIC_SLUGS.blog.some(slug => foundSlugs.has(slug));
  const hasShopPage = MAGIC_SLUGS.shop.some(slug => foundSlugs.has(slug));
  const hasEventsPage = MAGIC_SLUGS.events.some(slug => foundSlugs.has(slug));
  const hasNewsletterPage = MAGIC_SLUGS.newsletter.some(slug => foundSlugs.has(slug));
  const hasHomePage = MAGIC_SLUGS.home.some(slug => foundSlugs.has(slug));

  return {
    show_blog:
      navigationSettings.show_blog ??
      hasBlogPage ??
      counts.articles > 0,

    show_events:
      navigationSettings.show_events ??
      hasEventsPage ??
      counts.events > 0,

    show_shop:
      navigationSettings.show_shop ??
      hasShopPage ??
      counts.products > 0,

    show_about:
      navigationSettings.show_about ??
      hasAboutPage ??
      false,

    show_newsletter:
      navigationSettings.show_newsletter ??
      hasNewsletterPage ??
      false,

    show_home:
      navigationSettings.show_home ??
      hasHomePage ??
      false,

    has_upcoming_events: upcomingEvents > 0,
    has_events: counts.events > 0,

    content_summary: {
      articles_count: counts.articles,
      products_count: counts.products,
      events_count: counts.events,
      upcoming_events_count: upcomingEvents,
      pages_count: counts.pages,
    },

    magic_pages_detected: Array.from(foundSlugs),

    settings_overrides: Object.keys(navigationSettings).filter(k => k.startsWith('show_')),
  };
}
