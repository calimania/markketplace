import Stripe from 'stripe';

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_SECRET_TEST_KEY = process.env.STRIPE_SECRET_TEST_KEY;

console.log('[STRIPE_SERVICE] Loading - STRIPE_SECRET_KEY:', !!STRIPE_SECRET_KEY);
console.log('[STRIPE_SERVICE] Loading - STRIPE_SECRET_TEST_KEY:', !!STRIPE_SECRET_TEST_KEY);

// Fix: Add missing Stripe API version for initialization (required by Stripe SDK)
const STRIPE_API_VERSION = '2024-06-20';

// Initialize Stripe clients
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION }) : null;
const stripeTest = STRIPE_SECRET_TEST_KEY ? new Stripe(STRIPE_SECRET_TEST_KEY, { apiVersion: STRIPE_API_VERSION }) : null;

console.log('[STRIPE_SERVICE] Stripe clients initialized - stripe:', !!stripe, 'stripeTest:', !!stripeTest);

/**
 * Get the appropriate Stripe client (prod vs test) based on environment
 */
export function getStripeClient(useTestMode: boolean = false): Stripe | null {
  const defaultTestMode = process.env.NODE_ENV === 'development';
  const shouldUseTest = useTestMode || defaultTestMode;

  if (shouldUseTest && stripeTest) {
    return stripeTest;
  } else if (stripe) {
    return stripe;
  } else if (stripeTest) {
    console.warn('[STRIPE_SERVICE] Live Stripe not available, falling back to test mode');
    return stripeTest;
  }

  return null;
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!(stripe || stripeTest);
}

/**
 * Convert relative image URLs to full URLs
 */
export function getFullImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';

  if (url.length > 2048) {
    console.warn('[markket.stripe] Image URL too long, truncating');
    return '';
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  const baseUrl = (process.env.STRAPI_URL || 'http://localhost:1337').replace(/\/+$/, '');
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Strip HTML tags from description
 */
export function stripsMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return '';

  if (html.length > 1000) {
    html = html.substring(0, 1000);
  }

  return html
    .replace(/^#+\s*/gm, '')
    .replace(/(?<marks>(\*\*|\*|__|_))(?<inmarks>.*?)\k<marks>/gm, '$<inmarks>')
    .replace(/`(?<inmarks>.*?)`/gm, '$<inmarks>')
    .replace(/~~(?<inmarks>.*?)~~/gm, '$<inmarks>')
    .replace(/\[(?<link_text>.*?)\]\(.*\)/gm, '$<link_text>')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};
