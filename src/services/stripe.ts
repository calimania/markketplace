import Stripe from 'stripe';
import type { Stripe as StripeClient } from 'stripe';

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_SECRET_TEST_KEY = process.env.STRIPE_SECRET_TEST_KEY;
export const STRIPE_API_VERSION = '2026-06-24.dahlia';

const instances = {
  stripe: null,
  stripeTest: null,
};

export const init = () => {
  console.log('[STRIPE_SERVICE] Loading clients - STRIPE_SECRET_KEY:', !!STRIPE_SECRET_KEY);
  console.log('[STRIPE_SERVICE] Loading clients - STRIPE_SECRET_TEST_KEY:', !!STRIPE_SECRET_TEST_KEY);

  instances.stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION }) : null;
  instances.stripeTest = STRIPE_SECRET_TEST_KEY ? new Stripe(STRIPE_SECRET_TEST_KEY, { apiVersion: STRIPE_API_VERSION }) : null;

  console.log('[STRIPE_SERVICE] Stripe clients initialized - stripe:',
    !!instances.stripe, 'stripeTest:', !!instances.stripeTest);
};


/**
 * Get the appropriate Stripe client (prod vs test) based on environment,
 * load instances if not present
 */
export function getStripeClient(useTestMode: boolean = false): StripeClient | null {
  const defaultTestMode = process.env.NODE_ENV === 'development';
  const shouldUseTest = useTestMode || defaultTestMode;

  if (!instances.stripe && !instances.stripeTest) {
    init();
  }

  if (shouldUseTest && instances.stripeTest) {
    return instances.stripeTest;
  } else if (instances.stripe) {
    return instances.stripe;
  } else if (instances.stripeTest) {
    console.warn('[STRIPE_SERVICE] Live Stripe not available, falling back to test mode');
    return instances.stripeTest;
  }

  return null;
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!(instances.stripe || instances.stripeTest);
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
