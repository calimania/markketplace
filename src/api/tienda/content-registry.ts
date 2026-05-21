/**
 * Tienda Content Type Registry
 * Maps content keys to their Strapi UIDs, store relations, and mutable fields.
 * Sourced from types/generated/contentTypes.d.ts for accuracy.
 */

export interface ContentTypeConfig {
  uid: string;
  storeField: string; // 'store' | 'stores'
  storeRelationType: 'manyToOne' | 'manyToMany' | 'oneToOne';
  mutableFields: string[];
  readOnlyFields?: string[]; // Fields that should not be updated
  titleField: string; // For SEO auto-fill
  contentField?: string; // For SEO description truncation
  hasDraftAndPublish: boolean;
  defaultPopulate: string[];
  autoSetCreator?: 'user' | 'Creator' | 'creator' | 'owner'; // Field name to auto-populate
  // Field type metadata for sanitization before update
  mediaFields?: string[];           // Single/multi media — strip to id only
  relationFields?: string[];        // Relation fields — convert populated objects to connect format
  componentFields?: string[];       // Repeatable components — strip id to avoid stale entry conflicts
  nestedMediaFields?: string[];     // Dot-path media inside components, e.g. 'SEO.socialImage' — strip to id only
}

export const CONTENT_TYPES: Record<string, ContentTypeConfig> = {
  article: {
    uid: 'api::article.article',
    storeField: 'store',
    storeRelationType: 'manyToOne',
    titleField: 'Title',
    contentField: 'Content',
    hasDraftAndPublish: true,
    mutableFields: ['Title', 'slug', 'Content', 'cover', 'Tags', 'SEO', 'category', 'description', 'keywords'],
    readOnlyFields: ['Creator'],
    autoSetCreator: 'Creator',
    defaultPopulate: ['cover', 'Tags', 'SEO', 'SEO.socialImage', 'category', 'Creator', 'store'],
    mediaFields: ['cover'],
    relationFields: ['category'],
    componentFields: ['Tags'],
    nestedMediaFields: ['SEO.socialImage'],
  },
  page: {
    uid: 'api::page.page',
    storeField: 'store',
    storeRelationType: 'manyToOne',
    titleField: 'Title',
    contentField: 'Content',
    hasDraftAndPublish: true,
    mutableFields: ['Title', 'slug', 'Content', 'Active', 'menuOrder', 'SEO', 'albums', 'description', 'keywords'],
    autoSetCreator: 'owner',
    defaultPopulate: ['SEO', 'SEO.socialImage', 'albums', 'creator', 'owner', 'store'],
    relationFields: ['albums'],
    nestedMediaFields: ['SEO.socialImage'],
  },
  album: {
    uid: 'api::album.album',
    storeField: 'store',
    storeRelationType: 'manyToOne',
    titleField: 'title',
    contentField: 'description',
    hasDraftAndPublish: true,
    mutableFields: ['title', 'slug', 'description', 'content', 'SEO', 'cover', 'tracks', 'keywords'],
    autoSetCreator: 'owner',
    defaultPopulate: ['cover', 'SEO', 'SEO.socialImage', 'tracks', 'owner', 'store'],
    nestedMediaFields: ['SEO.socialImage'],
  },
  track: {
    uid: 'api::album.track',
    storeField: 'store',
    storeRelationType: 'manyToOne',
    titleField: 'title',
    contentField: 'description',
    hasDraftAndPublish: true,
    mutableFields: ['title', 'slug', 'description', 'content', 'SEO', 'media', 'urls', 'keywords'],
    autoSetCreator: 'owner',
    defaultPopulate: ['media', 'SEO', 'SEO.socialImage', 'urls', 'owner', 'store'],
    nestedMediaFields: ['SEO.socialImage'],
  },
  category: {
    uid: 'api::category.category',
    storeField: 'store',
    storeRelationType: 'manyToOne',
    titleField: 'Name',
    contentField: 'Description',
    hasDraftAndPublish: true,
    mutableFields: ['Name', 'slug', 'Description', 'SEO', 'Active', 'keywords'],
    autoSetCreator: 'owner',
    defaultPopulate: ['SEO', 'SEO.socialImage', 'articles', 'owner', 'store'],
    nestedMediaFields: ['SEO.socialImage'],
  },
  product: {
    uid: 'api::product.product',
    storeField: 'stores',
    storeRelationType: 'manyToMany',
    titleField: 'Name',
    contentField: 'Description',
    hasDraftAndPublish: true,
    mutableFields: [
      'Name', 'Description', 'attributes', 'usd_price', 'quantity', 'active',
      'Thumbnail', 'Slides', 'SEO', 'Tag', 'PRICES', 'keywords', 'description'
    ],
    readOnlyFields: ['SKU', 'slug'], // SKU is auto-synced with Stripe, slug is UID field
    autoSetCreator: 'creator',
    defaultPopulate: ['Thumbnail', 'Slides', 'SEO', 'SEO.socialImage', 'Tag', 'PRICES', 'stores', 'creator'],
    mediaFields: ['Thumbnail', 'Slides'],
    componentFields: ['Tag', 'PRICES'],
    nestedMediaFields: ['SEO.socialImage'],
  },
  event: {
    uid: 'api::event.event',
    storeField: 'stores',
    storeRelationType: 'manyToMany',
    titleField: 'Name',
    contentField: 'Description',
    hasDraftAndPublish: true,
    mutableFields: [
      'Name', 'Description', 'usd_price', 'startDate', 'endDate', 'maxCapacity',
      'active', 'Thumbnail', 'Slides', 'SEO', 'Tag', 'PRICES', 'keywords', 'description', 'timezone', 'locations'
    ],
    readOnlyFields: ['STRIPE_PRODUCT_ID', 'slug', 'amountSold'],
    autoSetCreator: 'creator',
    defaultPopulate: ['Thumbnail', 'Slides', 'SEO', 'SEO.socialImage', 'Tag', 'PRICES', 'stores', 'creator', 'locations'],
    mediaFields: ['Thumbnail', 'Slides'],
    componentFields: ['Tag', 'PRICES', 'locations'],
    nestedMediaFields: ['SEO.socialImage'],
  },
  shortner: {
    uid: 'api::shortner.shortner',
    storeField: 'store',
    storeRelationType: 'manyToOne',
    titleField: 'title',
    contentField: 'description',
    hasDraftAndPublish: false,
    mutableFields: ['title', 'url', 'description', 'image', 'keywords'],
    readOnlyFields: ['alias', 'visit'], // Alias is unique and immutable; visits are read-only
    autoSetCreator: 'user',
    defaultPopulate: ['image', 'store', 'user'],
  },
};

/**
 * Resolve content type config by key
 * Throws 400 if type not found
 */
export function resolveContentType(key: string): ContentTypeConfig {
  const config = CONTENT_TYPES[key];
  if (!config) {
    throw new Error(`Unknown content type: ${key}`);
  }
  return config;
}

/**
 * Get all metadata fields (should not expose to frontend)
 * Note: views/analytics fields will be added in Phase 2 with schema updates
 */
export const METADATA_FIELDS = {
  description: 'description', // short text for search
  keywords: 'keywords', // comma-separated or array of tags
  createdBy: 'createdBy', // user.id reference
  // Phase 2: views, lastViewedAt, analytics tracking
};

/**
 * Rate limit config
 */
export const RATE_LIMIT_CONFIG = {
  creatPerMin: 60, // Max creates per minute per store
  updatesPerMin: 120, // Max updates per minute per store
  deletesPerMin: 10, // Max deletes per minute per store
};
