/**
 * SEO HTML template generator for short URLs
 * Uses proper SEO schema aligned with generated Strapi types
 */

// Runtime types for the actual data objects (aligned with generated types)
interface ShortnerData {
  id: number;
  alias: string;
  url: string;
  title?: string;
  description?: string;
  visit: number;
  image?: {
    url: string;
    alternativeText?: string;
    width?: number;
    height?: number;
  };
  store?: StoreData;
}

interface StoreData {
  id: number;
  title?: string;
  SEO?: {
    metaTitle?: string;
    metaDescription?: string;
    metaKeywords?: string;
    socialImage?: {
      url: string;
      alternativeText?: string;
      width?: number;
      height?: number;
    };
    metaUrl?: string;
    metaDate?: string;
    metaAuthor?: string;
    excludeFromSearch?: boolean;
  };
  settings?: {
    domain?: string;
    [key: string]: any;
  };
  Favicon?: {
    url: string;
    alternativeText?: string;
  };
}

/**
 * Escape HTML entities to prevent XSS
 */
const escapeHtml = (unsafe: string): string => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Generate SEO-optimized HTML for bot crawlers
 */
export const generateSEOHTML = (shortner: ShortnerData, store: StoreData | null): string => {
  // Use common SEO schema field names
  const title = escapeHtml(
    shortner.title ||
    store?.SEO?.metaTitle ||
    `${store?.title || 'Markkët'} - Link`
  );

  const description = escapeHtml(
    shortner.description ||
    store?.SEO?.metaDescription ||
    `Check out this link from ${store?.title || 'Markkët'}`
  );

  const keywords = store?.SEO?.metaKeywords || '';
  const siteName = escapeHtml(store?.title || 'Markkët');
  const domain = store?.settings?.domain || 'https://de.markket.place';
  const favicon = store?.Favicon?.url || `${domain}/favicon.png`;
  const author = store?.SEO?.metaAuthor || siteName;

  // Use socialImage from store SEO or shortner image
  const socialImage = shortner.image?.url || store?.SEO?.socialImage?.url;
  const imageAlt = escapeHtml(
    shortner.image?.alternativeText ||
    store?.SEO?.socialImage?.alternativeText ||
    title
  );  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
  <meta name="author" content="${author}">
  <meta name="robots" content="${store?.SEO?.excludeFromSearch ? 'noindex, nofollow' : 'index, follow'}">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(shortner.url)}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:site_name" content="${siteName}">
  ${socialImage ? `<meta property="og:image" content="${socialImage}">` : ''}
  ${socialImage && shortner.image?.width ? `<meta property="og:image:width" content="${shortner.image.width}">` : ''}
  ${socialImage && shortner.image?.height ? `<meta property="og:image:height" content="${shortner.image.height}">` : ''}
  ${socialImage ? `<meta property="og:image:alt" content="${imageAlt}">` : ''}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${escapeHtml(shortner.url)}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  ${socialImage ? `<meta name="twitter:image" content="${socialImage}">` : ''}
  ${socialImage ? `<meta name="twitter:image:alt" content="${imageAlt}">` : ''}

  <!-- LinkedIn -->
  <meta property="article:author" content="${author}">

  <!-- Additional SEO -->
  <meta name="theme-color" content="#000000">
  <link rel="icon" type="image/x-icon" href="${favicon}">
  <link rel="canonical" href="${escapeHtml(shortner.url)}">

  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "url": "${escapeHtml(shortner.url)}",
    "name": "${title}",
    "description": "${description}",
    "publisher": {
      "@type": "Organization",
      "name": "${siteName}",
      "url": "${domain}"
    }${socialImage ? `,
    "image": {
      "@type": "ImageObject",
      "url": "${socialImage}",
      "description": "${imageAlt}"
    }` : ''}
  }
  </script>

  <!-- Instant redirect for bots that execute JS -->
  <script>
    setTimeout(() => {
      window.location.href = "${escapeHtml(shortner.url)}";
    }, 100);
  </script>
</head>
<body>
  <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif; color: #333;">
    <h1 style="color: #2c3e50;">Redirecting...</h1>
    <p>You will be redirected to <a href="${escapeHtml(shortner.url)}" style="color: #3498db; text-decoration: none;">${escapeHtml(shortner.url)}</a> shortly.</p>
    <p>If you are not redirected automatically, <a href="${escapeHtml(shortner.url)}" style="color: #3498db; text-decoration: none;">click here</a>.</p>
    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
    <p style="font-size: 14px; color: #7f8c8d;">Powered by ${siteName}</p>
  </div>
</body>
</html>`;
};
