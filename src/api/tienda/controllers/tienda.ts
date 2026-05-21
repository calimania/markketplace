import { checkStoreAccess, ERRORS, requireUser, sanitizeStore } from '../../../services/api-auth';
import {
  ensureStoreDefaultSendGridList,
  upsertContactToList,
  enrollStoreOwnerContact,
  sendWelcomeEmail,
} from '../../../services/sendgrid-marketing';
import { buildStoreOwnerCongratsEmailHtml, buildInviteEmailHtml } from '../../../services/sendgrid-email-templates';
import { decryptCredentials } from '../../../services/encryption';
import {
  verifyItemBelongsToStore,
  autoFillSEO,
  ensureGeneratedSlug,
  validateAndNormalizeSlug,
  pickAllowedFields,
  sanitizePayloadForUpdate,
  buildStoreRelation,
  applyPagination,
  checkRateLimit,
  buildStoreFilter,
  sanitizeContentItem,
} from '../helpers';
import { resolveContentType, RATE_LIMIT_CONFIG } from '../content-registry';
import { getMediaFieldConfig, getMediaTargetConfig, getMediaTargetsForClient } from '../media-targets';
import { warmStoreStatsCache } from '../../store/services/dashboard';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_PREFIXES = ['image/']; // 'video/', 'audio/'];
const ALLOWED_UPLOAD_MIME_EXACT = new Set([
  'application/pdf',
  'text/plain',
  'application/json',
]);
const DEFAULT_EVENT_TIMEZONE = 'America/New_York';
const ISO_UTC_OR_OFFSET_RE = /(Z|[+-]\d{2}:\d{2})$/i;
const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/;

const STORE_MUTABLE_FIELDS = [
  'title',
  'slug',
  'Description',
  'Logo',
  'Cover',
  'Slides',
  'Favicon',
  'URLS',
  'SEO',
  'addresses',
];

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  stores: 'store',
  articles: 'article',
  pages: 'page',
  albums: 'album',
  tracks: 'track',
  categories: 'category',
  products: 'product',
  events: 'event',
  shortners: 'shortner',
};

const FORCED_CONTENT_POPULATE_FIELDS = ['SEO', 'SEO.socialImage'];

function normalizePopulatePath(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

function collectPopulateFields(input: unknown, parentPath = ''): string[] {
  if (input == null || input === false) {
    return [];
  }

  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'true') {
      return parentPath ? [parentPath] : [];
    }
    if (normalized === 'false') {
      return [];
    }
    return normalizePopulatePath(input);
  }

  if (typeof input === 'number') {
    return input > 0 && parentPath ? [parentPath] : [];
  }

  if (Array.isArray(input)) {
    return input.flatMap(entry => collectPopulateFields(entry, parentPath));
  }

  if (typeof input === 'object') {
    return Object.entries(input as Record<string, unknown>).flatMap(([rawKey, rawValue]) => {
      const key = String(rawKey).trim();
      if (!key) {
        return [];
      }

      // Support qs-style formats: populate[SEO][populate][0]=socialImage
      if (key === 'populate') {
        return collectPopulateFields(rawValue, parentPath);
      }

      // Numeric keys are list indexes from query parser.
      if (/^\d+$/.test(key)) {
        return collectPopulateFields(rawValue, parentPath);
      }

      const nextPath = parentPath ? `${parentPath}.${key}` : key;
      const nested = collectPopulateFields(rawValue, nextPath);
      return nested.length > 0 ? nested : [nextPath];
    });
  }

  return [];
}

function resolveContentPopulate(defaultPopulate: string[], requestedPopulate: unknown): string[] {
  const merged = new Set<string>([
    ...defaultPopulate,
    ...collectPopulateFields(requestedPopulate),
    ...FORCED_CONTENT_POPULATE_FIELDS,
  ]);

  return Array.from(merged);
}

type StarterPageTemplate = {
  Title: string;
  slug: string;
  SEO: {
    metaTitle: string;
    metaDescription: string;
  };
  Content?: any[];
};

type StarterSeedContext = {
  defaultLocale: string;
  storeDocumentId: string;
  storeName: string;
  storeSlug: string;
};

function buildStarterPageTemplates(storeName: string): StarterPageTemplate[] {
  return [
    {
      Title: 'Homepage',
      slug: 'home',
      Content: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: `Welcome to ${storeName}`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'This starter homepage is here to help you launch quickly. Replace this copy with your own voice, offer, and links.',
            },
          ],
        },
      ],
      SEO: {
        metaTitle: `${storeName} Home`,
        metaDescription: `Start shopping at ${storeName}. Fresh products, upcoming events, and more.`,
      },
    },
    {
      Title: `${storeName} Newsletter`,
      slug: 'newsletter',
      SEO: {
        metaTitle: `${storeName} Newsletter`,
        metaDescription: `Subscribe to ${storeName} updates for launches, offers, and event invites.`,
      },
    },
    {
      Title: `About ${storeName}`,
      slug: 'about',
      Content: [
        {
          type: 'heading',
          level: 1,
          children: [
            {
              type: 'text',
              text: 'About',
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Welcome to our storefront.',
            },
            {
              type: 'text',
              text: ' Visit our blog and subscribe for updates to learn more.',
              bold: true,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Use this section to explain who you are, where to find you, and what you are building for your community.',
            },
          ],
        },
      ],
      SEO: {
        metaTitle: `About ${storeName}`,
        metaDescription: `Subscribe to ${storeName} updates for launches, offers, and event invites.`,
      },
    },
  ];
}

async function seedAndPublishStarterPages(params: {
  defaultLocale: string;
  storeDocumentId: string;
  ownerId: number | string;
  storeName: string;
}) {
  const { defaultLocale, storeDocumentId, ownerId, storeName } = params;
  const createdPages = [] as Array<{ documentId: string }>;

  for (const template of buildStarterPageTemplates(storeName)) {
    const page = await strapi.documents('api::page.page').create({
      locale: defaultLocale,
      data: {
        Title: template.Title,
        slug: template.slug,
        Active: true,
        store: storeDocumentId,
        owner: ownerId,
        SEO: template.SEO,
        ...(template.Content ? { Content: template.Content } : {}),
      } as any,
    });

    if (page?.documentId) {
      createdPages.push({ documentId: page.documentId });
    }
  }

  await Promise.all(
    createdPages.map(page => strapi.documents('api::page.page').publish({
      documentId: page.documentId,
      locale: defaultLocale,
    }))
  );
}

async function seedStarterArticle({ storeDocumentId, storeName, storeSlug }: StarterSeedContext) {
  const starterArticle = await strapi.documents('api::article.article').create({
    data: {
      Title: `Welcome to ${storeName}`,
      slug: `welcome-to-${storeSlug}`,
      store: storeDocumentId,
      description: 'Your store is live. This placeholder article helps you publish your first update quickly.',
      SEO: {
        metaTitle: `Welcome to ${storeName}`,
        metaDescription: `We are live and excited to share what is coming next at ${storeName}.`,
      },
    } as any,
  });

  await strapi.documents('api::article.article').publish({ documentId: starterArticle.documentId });
}

async function seedStarterContent(context: StarterSeedContext & { ownerId: number | string }) {
  await seedAndPublishStarterPages({
    defaultLocale: context.defaultLocale,
    storeDocumentId: context.storeDocumentId,
    ownerId: context.ownerId,
    storeName: context.storeName,
  });

  await seedStarterArticle(context);
}

function normalizeEventDatesToUTC(input: Record<string, any>, config: any): Record<string, any> {
  if (!input || typeof input !== 'object') return input;
  if (config?.uid !== 'api::event.event') return input;

  const next = { ...input };
  const timezoneAliases = ['timeZone', 'clientTimezone', 'browserTimezone'];
  if (!Object.prototype.hasOwnProperty.call(next, 'timezone')) {
    for (const alias of timezoneAliases) {
      if (Object.prototype.hasOwnProperty.call(next, alias)) {
        next.timezone = next[alias];
        break;
      }
    }
  }

  let resolvedTimezone: string | null = null;
  if (Object.prototype.hasOwnProperty.call(next, 'timezone')) {
    const normalizedTimezone = normalizeTimezoneInput(next.timezone);
    if (normalizedTimezone === null) {
      throw new Error('Invalid event timezone. Please send a valid IANA timezone like "America/New_York".');
    }
    if (normalizedTimezone) {
      resolvedTimezone = normalizedTimezone;
      next.timezone = normalizedTimezone;
    }
  }

  let hasDateFieldInPayload = false;
  for (const field of ['startDate', 'endDate']) {
    if (!Object.prototype.hasOwnProperty.call(next, field)) continue;
    hasDateFieldInPayload = true;
    const raw = next[field];
    if (!raw) continue;

    const normalizedDate = normalizeEventDateValue(raw, resolvedTimezone);
    if (!normalizedDate) {
      throw new Error(`Invalid event ${field}. Please send an ISO datetime or datetime-local string.`);
    }
    next[field] = normalizedDate;
  }

  // Do not silently overwrite timezone on updates that do not touch date/time fields.
  if (
    hasDateFieldInPayload
    && Object.prototype.hasOwnProperty.call(next, 'timezone')
    && (!next.timezone || String(next.timezone).trim().length === 0)
  ) {
    next.timezone = DEFAULT_EVENT_TIMEZONE;
  }

  return next;
}

function resolveSendGridCredentialsForTienda(extension: any): { api_key: string; use_default?: boolean } | null {
  if (process.env.SENDGRID_API_KEY) {
    return {
      api_key: '',
      use_default: true,
    };
  }

  if (!extension?.credentials) {
    return null;
  }

  try {
    const creds = decryptCredentials(extension.credentials);
    if (creds?.api_key || creds?.use_default) {
      return creds;
    }
  } catch (error: any) {
    console.warn('[TIENDA_SENDGRID] Failed to decrypt extension credentials:', error?.message);
  }

  if (typeof extension?.credentials?.api_key === 'string' && extension.credentials.api_key.trim()) {
    return extension.credentials;
  }

  return null;
}

function resolveSendGridCredentialSource(credentials: { api_key: string; use_default?: boolean } | null): 'env' | 'extension' | 'unknown' {
  if (!credentials) {
    return 'unknown';
  }

  if (credentials.use_default) {
    return 'env';
  }

  return 'extension';
}

function normalizeTimezoneInput(value: any): string | '' | null {
  if (value === undefined || value === null) {
    return '';
  }

  const timezone = String(value).trim();
  if (!timezone) {
    return '';
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    const canonical = formatter.resolvedOptions().timeZone;
    return canonical || timezone;
  } catch {
    return null;
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
    0,
  );

  return asUtc - date.getTime();
}

function convertLocalDateTimeToUtcIso(rawValue: string, timezone: string): string | null {
  const match = rawValue.match(LOCAL_DATETIME_RE);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || '0');
  const msText = match[7] || '';
  const millisecond = msText ? Number(msText.slice(1).padEnd(3, '0')) : 0;

  const localWallClockAsUtc = Date.UTC(year, month, day, hour, minute, second, millisecond);

  let corrected = localWallClockAsUtc;
  for (let i = 0; i < 4; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(corrected), timezone);
    const next = localWallClockAsUtc - offsetMs;
    if (next === corrected) {
      break;
    }
    corrected = next;
  }

  return new Date(corrected).toISOString();
}

function normalizeEventDateValue(rawValue: any, timezone: string | null): string | null {
  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue.toISOString();
  }

  if (typeof rawValue === 'number') {
    const parsedFromNumber = new Date(rawValue);
    return Number.isNaN(parsedFromNumber.getTime()) ? null : parsedFromNumber.toISOString();
  }

  if (typeof rawValue !== 'string') {
    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  if (ISO_UTC_OR_OFFSET_RE.test(trimmed)) {
    const withOffset = new Date(trimmed);
    return Number.isNaN(withOffset.getTime()) ? null : withOffset.toISOString();
  }

  if (timezone && LOCAL_DATETIME_RE.test(trimmed)) {
    return convertLocalDateTimeToUtcIso(trimmed, timezone);
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getRequestData(ctx: any): Record<string, any> {
  const body = ctx.request?.body;
  if (!body) {
    return {};
  }

  if (body.data && typeof body.data === 'object') {
    return body.data;
  }

  if (typeof body === 'object') {
    return body;
  }

  return {};
}

function normalizeContentTypeKey(value: any): string {
  const normalized = String(value || '').trim().toLowerCase();
  return CONTENT_TYPE_ALIASES[normalized] || normalized;
}

function pickStoreFields(input: Record<string, any>, allowedFields: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      out[field] = input[field];
    }
  }
  return out;
}

async function beforeActivities(_ctx: any, _action: string, _payload?: Record<string, any>): Promise<void> {
  // Reserved hook: rate-limit checks, token policies, and pre-webhook guards.
}

async function afterActivities(_ctx: any, _action: string, _result?: Record<string, any>): Promise<void> {
  // Reserved hook: alerting, audit trail, async webhooks, and usage tracking.
}

async function resolveDefaultLocaleCode(strapiInstance: any): Promise<string> {
  let defaultLocale = 'en';

  try {
    const locales: any[] = await ((strapiInstance.plugin('i18n') as any)?.service('locales')?.find?.() || []);
    const foundDefault = locales.find((locale: any) => locale?.isDefault);
    if (foundDefault?.code) {
      defaultLocale = foundDefault.code;
    }
  } catch (_error) {
    // Keep fallback locale when i18n service is unavailable.
  }

  return defaultLocale;
}

function normalizeUploadFiles(ctx: any): any[] {
  const files = ctx.request?.files;
  if (!files) {
    return [];
  }

  const candidates = [
    files.files,
    files.file,
    files.upload,
  ].filter(Boolean);

  if (candidates.length > 0) {
    const picked = candidates[0];
    return Array.isArray(picked) ? picked : [picked];
  }

  if (Array.isArray(files)) {
    return files;
  }

  return Object.values(files).flatMap((value: any) => (Array.isArray(value) ? value : [value]));
}

function isAllowedMime(mimeType: string): boolean {
  if (!mimeType) {
    return false;
  }

  if (ALLOWED_UPLOAD_MIME_EXACT.has(mimeType)) {
    return true;
  }

  return ALLOWED_UPLOAD_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
}

function parseJsonIfString(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeFileInfo(input: any, totalFiles: number): any[] {
  const parsed = parseJsonIfString(input);
  if (Array.isArray(parsed)) {
    return parsed.slice(0, totalFiles);
  }

  if (parsed && typeof parsed === 'object') {
    return [parsed];
  }

  return [];
}

function normalizeInputForContentType(input: Record<string, any>, config: any): Record<string, any> {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const normalized: Record<string, any> = { ...input };
  const mutableFields = Array.isArray(config?.mutableFields) ? config.mutableFields : [];

  if (mutableFields.length === 0) {
    return normalized;
  }

  const mutableFieldMap = new Map<string, string>();
  for (const field of mutableFields) {
    if (typeof field === 'string') {
      mutableFieldMap.set(field.toLowerCase(), field);
    }
  }

  for (const [key, value] of Object.entries(input)) {
    if (mutableFields.includes(key)) {
      continue;
    }

    const canonicalField = mutableFieldMap.get(String(key).toLowerCase());
    if (!canonicalField) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(normalized, canonicalField)) {
      normalized[canonicalField] = value;
    }
  }

  return normalized;
}

function ensureRequestId(ctx: any): string {
  const incomingRequestId = String(
    ctx.request?.headers?.['x-request-id'] ||
    ctx.request?.headers?.['x-correlation-id'] ||
    ''
  ).trim();

  const generatedRequestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const requestId = incomingRequestId || generatedRequestId;

  ctx.set('X-Request-Id', requestId);
  return requestId;
}

function resolveRequestedPublicationStatus(value: any): 'draft' | 'published' | null {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'draft' || status === 'published') {
    return status;
  }

  return null;
}

function buildPublicationMeta(hasDraft: boolean, hasPublished: boolean) {
  return {
    hasDraft,
    hasPublished,
    visibleStatus: hasPublished ? (hasDraft ? 'draft' : 'published') : 'unpublished',
  };
}

function withPublicationMeta(item: any, hasDraft: boolean, hasPublished: boolean) {
  if (!item) {
    return item;
  }

  return {
    ...item,
    tiendaPublication: buildPublicationMeta(hasDraft, hasPublished),
  };
}

async function findOwnerContentCollection(
  documentsApi: any,
  config: any,
  query: any,
  requestedStatus: 'draft' | 'published' | null,
  skip: number,
  limit: number,
) {
  if (!config.hasDraftAndPublish || requestedStatus) {
    const items = await documentsApi.findMany({
      ...query,
      skip,
      limit,
      ...(requestedStatus ? { status: requestedStatus } : {}),
    });

    const count = await documentsApi.count({
      filters: query.filters,
      ...(requestedStatus ? { status: requestedStatus } : {}),
    });

    const publicationItems = (items || []).map((item: any) => withPublicationMeta(
      item,
      requestedStatus !== 'published',
      requestedStatus !== 'draft',
    ));

    return {
      items: publicationItems,
      total: count,
    };
  }

  const [draftItems, publishedItems] = await Promise.all([
    documentsApi.findMany({
      ...query,
      status: 'draft',
    }),
    documentsApi.findMany({
      ...query,
      status: 'published',
    }),
  ]);

  const publishedByDocumentId = new Map<string, any>();
  for (const item of publishedItems || []) {
    if (item?.documentId) {
      publishedByDocumentId.set(item.documentId, item);
    }
  }

  const mergedByDocumentId = new Map<string, any>();
  for (const item of publishedItems || []) {
    if (item?.documentId) {
      mergedByDocumentId.set(
        item.documentId,
        withPublicationMeta(item, false, true),
      );
    }
  }

  for (const item of draftItems || []) {
    if (item?.documentId) {
      mergedByDocumentId.set(
        item.documentId,
        withPublicationMeta(item, true, publishedByDocumentId.has(item.documentId)),
      );
    }
  }

  const allItems = Array.from(mergedByDocumentId.values()).sort((left: any, right: any) => {
    const leftTime = new Date(left?.updatedAt || left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.updatedAt || right?.createdAt || 0).getTime();
    return rightTime - leftTime;
  });

  return {
    items: allItems.slice(skip, skip + limit),
    total: allItems.length,
  };
}

async function findOwnerContentItem(
  documentsApi: any,
  config: any,
  documentId: string,
  populate: any,
  requestedStatus: 'draft' | 'published' | null,
  locale?: string,
) {
  const sharedQuery = {
    documentId,
    populate,
    ...(locale ? { locale } : {}),
  };

  if (!config.hasDraftAndPublish || requestedStatus) {
    const item = await documentsApi.findOne({
      ...sharedQuery,
      ...(requestedStatus ? { status: requestedStatus } : {}),
    });

    if (!item) {
      return null;
    }

    return withPublicationMeta(item, requestedStatus !== 'published', requestedStatus !== 'draft');
  }

  const [draftItem, publishedItem] = await Promise.all([
    documentsApi.findOne({
      ...sharedQuery,
      status: 'draft',
    }),
    documentsApi.findOne({
      ...sharedQuery,
      status: 'published',
    }),
  ]);

  const selectedItem = draftItem || publishedItem;
  if (!selectedItem) {
    return null;
  }

  return withPublicationMeta(selectedItem, Boolean(draftItem), Boolean(publishedItem));
}

async function hasPublishedContentVersion(
  documentsApi: any,
  documentId: string,
  locale?: string,
): Promise<boolean> {
  const publishedItem = await documentsApi.findOne({
    documentId,
    status: 'published',
    ...(locale ? { locale } : {}),
  });

  return !!publishedItem;
}

function formatDashboardUser(user: any) {
  if (!user?.id) {
    return null;
  }

  const email = typeof user.email === 'string' ? user.email.trim() : '';
  const emailLocalPart = email.includes('@') ? email.split('@')[0] : '';

  return {
    id: user.id,
    username: user.username || null,
    email: user.email || null,
    displayName: user.displayName || user.username || emailLocalPart || null,
    confirmed: typeof user.confirmed === 'boolean' ? user.confirmed : null,
  };
}

async function buildStoreMembersPayload(strapi: any, store: any) {
  const membershipDocuments = (strapi.documents as any)('api::store-membership.store-membership');
  const membershipRows = await membershipDocuments.findMany({
    filters: {
      store: { documentId: store.documentId },
      status: 'active',
    } as any,
    populate: ['user', 'invited_by'],
    sort: [{ joined_at: 'asc' }, { createdAt: 'asc' }],
    limit: 200,
  }) as any[];

  const membersByUserId = new Map<number, any>();
  for (const row of membershipRows || []) {
    const memberUser = formatDashboardUser(row?.user);
    if (!memberUser?.id) {
      continue;
    }

    membersByUserId.set(Number(memberUser.id), {
      user: memberUser,
      role: row?.role || 'editor',
      status: row?.status || 'active',
      joinedAt: row?.joined_at || row?.createdAt || null,
      invitedBy: formatDashboardUser(row?.invited_by),
      source: 'membership',
    });
  }

  const ownerId = Number(store?.owner?.id) || null;
  const legacyUsers = Array.isArray(store?.users) ? store.users : [];
  for (const legacyUser of legacyUsers) {
    const memberUser = formatDashboardUser(legacyUser);
    if (!memberUser?.id || membersByUserId.has(Number(memberUser.id))) {
      continue;
    }

    membersByUserId.set(Number(memberUser.id), {
      user: memberUser,
      role: ownerId && Number(memberUser.id) === ownerId ? 'owner' : 'editor',
      status: 'active',
      joinedAt: null,
      invitedBy: null,
      source: 'legacy_users',
    });
  }

  if (ownerId && !membersByUserId.has(ownerId) && store?.owner) {
    const ownerUser = formatDashboardUser(store.owner);
    if (ownerUser) {
      membersByUserId.set(ownerId, {
        user: ownerUser,
        role: 'owner',
        status: 'active',
        joinedAt: null,
        invitedBy: null,
        source: 'owner_relation',
      });
    }
  }

  const members = Array.from(membersByUserId.values()).sort((left: any, right: any) => {
    if (left.role === 'owner' && right.role !== 'owner') return -1;
    if (right.role === 'owner' && left.role !== 'owner') return 1;
    const leftTime = new Date(left.joinedAt || 0).getTime();
    const rightTime = new Date(right.joinedAt || 0).getTime();
    return leftTime - rightTime;
  });

  const owner = members.find((member: any) => member.role === 'owner') || null;
  return {
    owner,
    members,
    total: members.length,
    membershipCount: membershipRows?.length || 0,
    legacyUserCount: legacyUsers.length,
  };
}

export default {
  async me(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const includeCombinedContent = ['1', 'true', 'yes'].includes(String(ctx.query?.includeContent || '').toLowerCase());

    const payload: any = {
      ok: true,
      actor: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };

    if (includeCombinedContent) {
      const page = Math.max(1, Number.parseInt(String(ctx.query?.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(ctx.query?.pageSize || '25'), 10) || 25));
      const searchTerm = String(ctx.query?.search || '').trim();
      const requestedTypes = String(ctx.query?.types || '')
        .split(',')
        .map((value: string) => normalizeContentTypeKey(value))
        .filter(Boolean);
      const contentTypes = requestedTypes.length > 0
        ? Array.from(new Set(requestedTypes))
        : ['article', 'page', 'product', 'event'];

      const storesFromUsers = await strapi.documents('api::store.store').findMany({
        filters: { users: { id: user.id } },
        fields: ['documentId', 'title', 'slug'],
      }) as any[];

      const storesFromAdmins = await strapi.documents('api::store.store').findMany({
        filters: { admin_users: { id: user.id } },
        fields: ['documentId', 'title', 'slug'],
      }) as any[];

      const uniqueStores = new Map<string, any>();
      for (const store of [...(storesFromUsers || []), ...(storesFromAdmins || [])]) {
        if (store?.documentId) {
          uniqueStores.set(store.documentId, store);
        }
      }

      const perTypeResults = await Promise.all(contentTypes.map(async (contentType: string) => {
        try {
          const config = resolveContentType(contentType);
          const documentsApi = (strapi.documents as any)(config.uid);
          const storeIds = Array.from(uniqueStores.keys());
          if (storeIds.length === 0) {
            return [];
          }

          const filters: any[] = [
            {
              [config.storeField]: {
                documentId: { $in: storeIds },
              },
            },
          ];

          if (searchTerm) {
            const searchFields: any[] = [
              { [config.titleField]: { $containsi: searchTerm } },
              { keywords: { $containsi: searchTerm } },
              { description: { $containsi: searchTerm } },
              { Description: { $containsi: searchTerm } },
            ];
            if (config.contentField) {
              searchFields.push({ [config.contentField]: { $containsi: searchTerm } });
            }
            filters.push({ $or: searchFields });
          }

          const items = await documentsApi.findMany({
            filters: filters.length === 1 ? filters[0] : { $and: filters },
            populate: config.defaultPopulate,
            sort: { updatedAt: 'desc' },
            limit: 100,
          });

          return (items || []).map((item: any) => {
            const normalized = sanitizeContentItem(item, config);
            const relatedStores = Array.isArray(normalized?.stores)
              ? normalized.stores
              : (normalized?.store ? [normalized.store] : []);
            const primaryStore = relatedStores?.[0] || null;

            return {
              contentType,
              documentId: normalized.documentId,
              title: normalized?.[config.titleField] || null,
              updatedAt: normalized.updatedAt || normalized.createdAt || null,
              store: primaryStore
                ? {
                  documentId: primaryStore.documentId,
                  title: primaryStore.title || null,
                  slug: primaryStore.slug || null,
                }
                : null,
              item: normalized,
            };
          });
        } catch {
          return [];
        }
      }));

      const combinedItems = perTypeResults
        .flat()
        .sort((left: any, right: any) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());

      const start = (page - 1) * pageSize;
      payload.combinedContent = {
        data: combinedItems.slice(start, start + pageSize),
        pagination: {
          page,
          pageSize,
          total: combinedItems.length,
          pages: Math.ceil(combinedItems.length / pageSize),
        },
      };
    }

    return ctx.send(payload);
  },

  async listMembers(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);

    const access = await checkStoreAccess(strapi, user.id, ref);
    if (!access?.store || !access?.hasAccess) {
      return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
    }

    const payload = await buildStoreMembersPayload(strapi, access.store);

    return ctx.send({
      ok: true,
      store: {
        documentId: access.store.documentId,
        slug: access.store.slug,
        title: access.store.title || null,
      },
      owner: payload.owner,
      members: payload.members,
      total: payload.total,
      counts: {
        memberships: payload.membershipCount,
        legacyUsers: payload.legacyUserCount,
      },
    });
  },

  async stores(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    try {
      const storesFromUsers = await strapi.documents('api::store.store').findMany({
        filters: { users: { id: user.id } },
        populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'] as any,
      }) as any[];

      const storesFromAdmins = await strapi.documents('api::store.store').findMany({
        filters: { admin_users: { id: user.id } },
        populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'] as any,
      }) as any[];

      const uniqueByDocumentId = new Map<string, any>();
      for (const item of [...(storesFromUsers || []), ...(storesFromAdmins || [])]) {
        if (item?.documentId) {
          uniqueByDocumentId.set(item.documentId, sanitizeStore(item));
        }
      }

      return ctx.send({
        ok: true,
        data: Array.from(uniqueByDocumentId.values()),
      });
    } catch (error) {
      console.error('[TIENDA_STORES] List failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async createStore(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const requestData = getRequestData(ctx);
    const data = pickStoreFields(requestData, STORE_MUTABLE_FIELDS);

    if (!data.title || !data.slug) {
      return ctx.badRequest('title and slug are required');
    }

    const slugResult = validateAndNormalizeSlug(data.slug);
    if ('error' in slugResult) {
      return ctx.badRequest(slugResult.error);
    }
    data.slug = slugResult.slug;

    try {
      await beforeActivities(ctx, 'store.create', data);

      const storeDocuments = (strapi.documents as any)('api::store.store');
      const membershipDocuments = (strapi.documents as any)('api::store-membership.store-membership');

      const existingUserStores = await strapi.documents('api::store.store').findMany({
        filters: { users: { id: user.id } },
        fields: ['documentId'],
      });
      const existingAdminStores = await strapi.documents('api::store.store').findMany({
        filters: { admin_users: { id: user.id } },
        fields: ['documentId'],
      });
      const existingStoreIds = new Set<string>([
        ...((existingUserStores || []).map((entry: any) => String(entry.documentId)).filter(Boolean)),
        ...((existingAdminStores || []).map((entry: any) => String(entry.documentId)).filter(Boolean)),
      ]);
      const associatedStoreCountBeforeCreate = existingStoreIds.size;

      const defaultLocale = await resolveDefaultLocaleCode(strapi);

      const created = await storeDocuments.create({
        locale: defaultLocale,
        data: {
          ...(data as any),
          owner: user.id,
        },
        populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'],
      }) as any;

      const updated = await storeDocuments.update({
        documentId: created.documentId,
        locale: defaultLocale,
        data: {
          owner: user.id,
          users: {
            connect: [user.id],
          },
        },
        populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'],
      }) as any;

      const existingOwnerMembership = await membershipDocuments.findMany({
        filters: {
          store: { documentId: created.documentId },
          user: { id: user.id },
        } as any,
        limit: 1,
      }) as any[];

      if (!existingOwnerMembership?.length) {
        await membershipDocuments.create({
          data: {
            store: created.documentId,
            user: user.id,
            role: 'owner',
            status: 'active',
            joined_at: new Date().toISOString(),
          } as any,
        });
      }

      await strapi.documents('api::store.store').publish({
        documentId: created.documentId,
        locale: defaultLocale,
      });

      // Enroll store owner in platform marketing list (non-fatal)
      if (user.email) {
        enrollStoreOwnerContact({
          email: user.email,
          storeDocumentId: created.documentId,
          firstName: user.firstname || undefined,
          lastName: user.lastname || undefined,
        }).catch((err: any) => {
          console.warn('[TIENDA_STORE_CREATE] Owner enrollment skipped:', err?.message);
        });

        const isFirstAssociatedStore = associatedStoreCountBeforeCreate === 0;
        const introLine = isFirstAssociatedStore
          ? 'This is your first store on Markketplace. Start by updating your homepage, adding one product, and setting your brand details.'
          : 'Your new store is ready. Add content, products, and event details to make it discoverable quickly.';
        const adviceLine = 'Platform advice: keep your About page clear, use plain titles, and publish one update every week for momentum.';
        const html = buildStoreOwnerCongratsEmailHtml({
          ownerName: user.firstname || user.username || undefined,
          storeName: String(data.title || ''),
          storeSlug: String(data.slug || ''),
          isFirstStore: isFirstAssociatedStore,
          introLine,
          adviceLine,
        });

        sendWelcomeEmail({
          credentials: { use_default: true, api_key: '' },
          toEmail: user.email,
          subject: isFirstAssociatedStore
            ? `Welcome to Markketplace, ${user.firstname || user.username || 'store owner'}!`
            : `Congrats on your new store: ${data.title}`,
          htmlContent: html,
        }).then(result => {
          if (!result.success) {
            console.warn('[TIENDA_STORE_CREATE] Congrats email skipped:', result.error || result.message);
          }
        }).catch((err: any) => {
          console.warn('[TIENDA_STORE_CREATE] Congrats email pipeline skipped:', err?.message);
        });
      }

      // Seed starter content for new stores.
      // Failures here should not block store creation.
      try {
        const storeDocumentId = created.documentId;
        const storeName = (updated || created).title || data.title || 'My Store';
        const storeSlug = (updated || created).slug || data.slug || 'my-store';

        await seedStarterContent({
          defaultLocale,
          storeDocumentId,
          ownerId: user.id,
          storeName,
          storeSlug,
        });
      } catch (seedError: any) {
        const seedDetails = seedError?.details?.errors || seedError?.details || null;
        // Non-fatal — log with detail, but don't fail store creation
        console.error('[TIENDA_STORE_CREATE] Starter content seed failed:', {
          message: seedError?.message,
          details: seedDetails,
          stack: seedError?.stack,
        });
      }

      // Warm dashboard stats cache so owner UI is fast on first load.
      warmStoreStatsCache(created.documentId).catch((cacheError: any) => {
        console.warn('[TIENDA_STORE_CREATE] Dashboard stats warm-up skipped:', cacheError?.message);
      });

      await afterActivities(ctx, 'store.create', { store: updated || created });

      return ctx.send({
        ok: true,
        store: sanitizeStore(updated || created),
      });
    } catch (error: any) {
      if (error?.message?.toLowerCase().includes('unique') || error?.details?.errors?.some?.((e: any) => e?.path?.includes('slug'))) {
        return ctx.conflict(`A store with slug "${data.slug}" already exists. Please choose a different slug.`);
      }
      console.error('[TIENDA_STORE_CREATE] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async updateStore(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const requestData = getRequestData(ctx);
    const data = pickStoreFields(requestData, STORE_MUTABLE_FIELDS);

    if (Object.keys(data).length === 0) {
      return ctx.badRequest('No allowed fields provided');
    }

    // Validate slug if being changed
    if (data.slug !== undefined) {
      const slugResult = validateAndNormalizeSlug(data.slug);
      if ('error' in slugResult) {
        return ctx.badRequest(slugResult.error);
      }
      data.slug = slugResult.slug;
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      await beforeActivities(ctx, 'store.update', data);

      const updated = await strapi.documents('api::store.store').update({
        documentId: access.store.documentId,
        data,
        populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'] as any,
      }) as any;

      await strapi.documents('api::store.store').publish({
        documentId: access.store.documentId,
      });

      await afterActivities(ctx, 'store.update', { store: updated });

      return ctx.send({
        ok: true,
        store: sanitizeStore(updated),
      });
    } catch (error: any) {
      if (error?.message?.toLowerCase().includes('unique') || error?.details?.errors?.some?.((e: any) => e?.path?.includes('slug'))) {
        return ctx.conflict(`A store with slug "${data.slug}" already exists. Please choose a different slug.`);
      }
      console.error('[TIENDA_STORE_UPDATE] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async publishStore(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const requestedLocale = String(ctx.request?.body?.locale || '').trim();

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      await strapi.documents('api::store.store').publish({
        documentId: access.store.documentId,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
      });

      const refreshed = await strapi.documents('api::store.store').findOne({
        documentId: access.store.documentId,
        populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'] as any,
        ...(requestedLocale ? { locale: requestedLocale, status: 'published' as const } : { status: 'published' as const }),
      }) as any;

      await afterActivities(ctx, 'store.publish', { store: refreshed || access.store });

      return ctx.send({
        ok: true,
        store: sanitizeStore(refreshed || access.store),
      });
    } catch (error: any) {
      console.error('[TIENDA_STORE_PUBLISH] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async unpublishStore(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const requestedLocale = String(ctx.request?.body?.locale || '').trim();

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      await strapi.documents('api::store.store').unpublish({
        documentId: access.store.documentId,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
      });

      const refreshed = await strapi.documents('api::store.store').findOne({
        documentId: access.store.documentId,
        populate: ['settings', 'users', 'admin_users', 'owner', 'URLS', 'SEO', 'SEO.socialImage'] as any,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
      }) as any;

      await afterActivities(ctx, 'store.unpublish', { store: refreshed || access.store });

      return ctx.send({
        ok: true,
        store: sanitizeStore(refreshed || access.store),
      });
    } catch (error: any) {
      console.error('[TIENDA_STORE_UNPUBLISH] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async store(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      return ctx.send({
        ok: true,
        actor: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        store: sanitizeStore(access.store),
      });
    } catch (error) {
      console.error('[TIENDA_STORE] Resolver failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async storeSettings(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      return ctx.send({
        ok: true,
        settings: access.store.settings || null,
      });
    } catch (error) {
      console.error('[TIENDA_STORE_SETTINGS_GET] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  async updateStoreSettings(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const data = getRequestData(ctx);
    if (!data || typeof data !== 'object') {
      return ctx.badRequest('Invalid settings payload');
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
      }

      await beforeActivities(ctx, 'store.settings.update', data);

      let settings: any;
      let created = false;
      if (access.store.settings?.documentId) {
        settings = await strapi.documents('api::store.store-setting').update({
          documentId: access.store.settings.documentId,
          data,
        });
      } else {
        settings = await strapi.documents('api::store.store-setting').create({
          data: {
            ...data,
            store: access.store.documentId,
          },
        });
        created = true;
      }

      await afterActivities(ctx, 'store.settings.update', { settings });

      return ctx.send({
        ok: true,
        created,
        settings,
      });
    } catch (error) {
      console.error('[TIENDA_STORE_SETTINGS_UPDATE] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  /**
   * GET /api/tienda/tendero/:ref
   * Resolves store by documentId or slug and enforces actor-store ownership.
   */
  async tendero(ctx: any) {
    return this.store(ctx);
  },

  /**
   * GET /api/tienda/stores/:ref/media-targets
   * Returns attachable media targets/fields so clients can drive upload UI from backend config.
   */
  async mediaTargets(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const access = await checkStoreAccess(strapi, user.id, ref);
    if (!access?.store || !access?.hasAccess) {
      return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
    }

    return ctx.send({
      ok: true,
      store: {
        documentId: access.store.documentId,
        slug: access.store.slug,
      },
      targets: getMediaTargetsForClient(),
    });
  },

  /**
   * GET /api/tienda/stores/:ref/content/:contentType
   * List all content items of a specific type for a store with pagination and search
   */
  async listContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType } = ctx.params;

    try {
      const config = resolveContentType(contentType);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Rate limit: list operations are cheap, allow many
      const rateLimitKey = `list:${access.store.documentId}:${contentType}`;
      const rateLimit = checkRateLimit(rateLimitKey, 300); // 300/min = 5/sec, very generous
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      const { skip, limit } = applyPagination(ctx);
      const requestedStatus = resolveRequestedPublicationStatus(ctx.query.status);
      const documentsApi = (strapi.documents as any)(config.uid);
      const populate = resolveContentPopulate(config.defaultPopulate, ctx.query.populate);
      const storeFilter = buildStoreFilter(access.store.documentId, config);
      const clientFilters =
        ctx.query.filters && typeof ctx.query.filters === 'object' && !Array.isArray(ctx.query.filters)
          ? ctx.query.filters
          : null;
      const filterClauses: any[] = [storeFilter];

      if (clientFilters) {
        filterClauses.push(clientFilters);
      }

      const query: any = {
        filters: filterClauses.length === 1 ? filterClauses[0] : { $and: filterClauses },
        populate,
      };

      // Apply search if provided
      if (ctx.query.search) {
        const searchTerm = String(ctx.query.search).trim();
        if (searchTerm.length > 0) {
          const titleField = config.titleField;
          const searchFields: any[] = [
            { [titleField]: { $containsi: searchTerm } },
            { keywords: { $containsi: searchTerm } },
            { description: { $containsi: searchTerm } },
            { Description: { $containsi: searchTerm } },
          ];

          if (config.contentField) {
            searchFields.push({ [config.contentField]: { $containsi: searchTerm } });
          }

          filterClauses.push({
            $or: searchFields,
          });

          query.filters = filterClauses.length === 1 ? filterClauses[0] : { $and: filterClauses };
        }
      }

      const { items, total } = await findOwnerContentCollection(
        documentsApi,
        config,
        query,
        requestedStatus,
        skip,
        limit,
      );

      return ctx.send({
        ok: true,
        data: (items || []).map(item => sanitizeContentItem(item, config)),
        pagination: {
          page: Math.floor(skip / limit) + 1,
          pageSize: limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error(`[TIENDA_LIST_CONTENT] ${contentType} failed:`, error.message);
      if (error.message.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      return ctx.internalServerError('Request failed');
    }
  },

  /**
   * POST /api/tienda/stores/:ref/content/:contentType
   * Create a new content item in the store
   */
  async createContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType } = ctx.params;
    const rawInputData = getRequestData(ctx);
    const requestId = ensureRequestId(ctx);

    try {
      const config = resolveContentType(contentType);
      const normalizedInputData = normalizeInputForContentType(rawInputData, config);
      const inputData = normalizeEventDatesToUTC(normalizedInputData, config);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Rate limit: creates are expensive
      const rateLimitKey = `create:${access.store.documentId}`;
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG.creatPerMin);
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      // Pick allowed fields only
      const createData = pickAllowedFields(inputData, config);

      // Sanitize media/relation/component fields
      const sanitizedCreateData = sanitizePayloadForUpdate(createData, config);

      // Auto-fill SEO if title/content fields are present
      const enrichedData = ensureGeneratedSlug(autoFillSEO(sanitizedCreateData, config), config);

      const creatorData = config.autoSetCreator
        ? { [config.autoSetCreator]: user.id }
        : {};

      // Add store relation
      const dataWithStore = {
        ...enrichedData,
        ...creatorData,
        ...buildStoreRelation(access.store.documentId, config),
      };

      // Create and optionally publish based on content type config
      let item: any;
      try {
        item = await (strapi.documents as any)(config.uid).create({
          data: dataWithStore,
          populate: config.defaultPopulate,
        });
      } catch (createError: any) {
        console.error(`[TIENDA_CREATE_CONTENT] Strapi create failed for ${contentType}:`, createError.message);
        if (createError.message?.includes('unique')) {
          return ctx.conflict(`A ${contentType} with that slug or identifier already exists. requestId=${requestId}`);
        }
        return ctx.internalServerError(`Failed to create ${contentType}: ${createError.message}. requestId=${requestId}`);
      }

      const createWarnings: string[] = [];

      // Auto-publish if requested
      if (inputData.publishNow && config.hasDraftAndPublish) {
        try {
          await (strapi.documents as any)(config.uid).publish({
            documentId: item.documentId,
          });
        } catch (publishError: any) {
          console.warn(`[TIENDA_CREATE_CONTENT] Publish failed after create for ${contentType}/${item.documentId}:`, publishError.message);
          createWarnings.push(`Item created as draft. Publish failed: ${publishError.message}`);
        }
      }

      await afterActivities(ctx, `content.${contentType}.create`, { item });

      return ctx.send({
        ok: true,
        requestId,
        data: sanitizeContentItem(item, config),
        ...(createWarnings.length > 0 ? { warnings: createWarnings } : {}),
      });
    } catch (error: any) {
      console.error(`[TIENDA_CREATE_CONTENT] Unexpected error for ${contentType}:`, error.message);
      if (error.message?.startsWith('Invalid event timezone') || error.message?.startsWith('Invalid event startDate') || error.message?.startsWith('Invalid event endDate')) {
        return ctx.badRequest(error.message);
      }
      if (error.message?.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      return ctx.internalServerError(`Unexpected error: ${error.message}. requestId=${requestId}`);
    }
  },

  /**
   * GET /api/tienda/stores/:ref/content/:contentType/:itemId
   * Get a single content item by ID
   */
  async getContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType, itemId } = ctx.params;

    try {
      const config = resolveContentType(contentType);
      const access = await checkStoreAccess(strapi, user.id, ref);
      const requestedStatus = resolveRequestedPublicationStatus(ctx.query.status);
      const documentsApi = (strapi.documents as any)(config.uid);
      const populate = resolveContentPopulate(config.defaultPopulate, ctx.query.populate);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      const item = await findOwnerContentItem(
        documentsApi,
        config,
        itemId,
        populate,
        requestedStatus,
      );

      if (!item) {
        return ctx.notFound('Content not found');
      }

      // Verify item belongs to store
      if (!verifyItemBelongsToStore(item, access.store.documentId, config)) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      return ctx.send({
        ok: true,
        data: sanitizeContentItem(item, config),
      });
    } catch (error) {
      console.error(`[TIENDA_GET_CONTENT] ${contentType} failed:`, error.message);
      if (error.message.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      return ctx.internalServerError('Request failed');
    }
  },

  /**
   * PUT /api/tienda/stores/:ref/content/:contentType/:itemId
   * Update a content item
   */
  async updateContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType, itemId } = ctx.params;
    const rawInputData = getRequestData(ctx);
    const requestId = ensureRequestId(ctx);
    const requestedLocale = typeof ctx.query?.locale === 'string'
      ? String(ctx.query.locale).trim()
      : (typeof rawInputData?.locale === 'string' ? String(rawInputData.locale).trim() : '');

    try {
      const config = resolveContentType(contentType);
      const normalizedInputData = normalizeInputForContentType(rawInputData, config);
      const inputData = normalizeEventDatesToUTC(normalizedInputData, config);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Rate limit: updates
      const rateLimitKey = `update:${access.store.documentId}`;
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG.updatesPerMin);
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      // Fetch current item to verify ownership
      const item = await (strapi.documents as any)(config.uid).findOne({
        documentId: itemId,
        populate: config.defaultPopulate,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
      });

      if (!item) {
        return ctx.notFound('Content not found');
      }

      if (!verifyItemBelongsToStore(item, access.store.documentId, config)) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Detect whether this document already has a published version so we can
      // preserve draft-only items on save.
      const hadPublishedBefore = config.hasDraftAndPublish
        ? Boolean(await (strapi.documents as any)(config.uid).findOne({
          documentId: itemId,
          status: 'published',
          ...(requestedLocale ? { locale: requestedLocale } : {}),
        }))
        : false;

      // Pick allowed fields only
      const updateData = pickAllowedFields(inputData, config);
      const hasStateOnlyAction = Boolean(
        config.hasDraftAndPublish && (inputData.publishNow || inputData.unpublishNow)
      );
      const hasContentChanges = Object.keys(updateData).length > 0;

      if (!hasContentChanges && !hasStateOnlyAction) {
        const writableFields = (config.mutableFields || []).filter(
          field => !(config.readOnlyFields || []).includes(field)
        );

        return ctx.badRequest(
          `No allowed fields provided for "${contentType}". Allowed fields: ${writableFields.join(', ')}`
        );
      }

      // Sanitize media/relation/component fields so populated GET data can be PUT back directly
      let updated: any;
      if (hasContentChanges) {
        const sanitizedData = sanitizePayloadForUpdate(updateData, config);

        // If the client didn't send SEO but the existing item has SEO data, pre-seed it so
        // that autoFillSEO only fills empty fields and doesn't wipe stored values like
        // socialImage. Strapi v5 replaces the whole component on write, so any field
        // absent from the payload is cleared — pre-seeding prevents accidental loss.
        const clientSentSEO = Object.prototype.hasOwnProperty.call(updateData, 'SEO');
        if (!clientSentSEO && item.SEO && typeof item.SEO === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _cid, ...existingSEOFields } = item.SEO as any;
          const seoToMerge: any = { ...existingSEOFields };
          // Reduce socialImage to { id } reference — full object would be rejected by Strapi v5
          if (seoToMerge.socialImage && typeof seoToMerge.socialImage === 'object') {
            const imgId = seoToMerge.socialImage.id ?? seoToMerge.socialImage.documentId;
            seoToMerge.socialImage = imgId ? { id: imgId } : null;
          }
          sanitizedData.SEO = seoToMerge;
        } else if (clientSentSEO && item.SEO && typeof item.SEO === 'object') {
          // Client sent SEO but may have omitted socialImage — preserve existing image
          // unless the client explicitly sent null (intentional clear).
          const clientSEO = sanitizedData.SEO as any;
          if (clientSEO && typeof clientSEO === 'object' && !Object.prototype.hasOwnProperty.call(clientSEO, 'socialImage')) {
            const existingImg = (item.SEO as any).socialImage;
            if (existingImg) {
              const imgId = existingImg.id ?? existingImg.documentId;
              clientSEO.socialImage = imgId ? { id: imgId } : null;
            }
          }
        }

        // Auto-fill SEO if title/content fields are present
        const enrichedData = ensureGeneratedSlug(autoFillSEO(sanitizedData, config), config, item);

        try {
          updated = await (strapi.documents as any)(config.uid).update({
            documentId: itemId,
            data: enrichedData,
            populate: config.defaultPopulate,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (updateError: any) {
          console.error(`[TIENDA_UPDATE_CONTENT] Strapi update failed for ${contentType}/${itemId}:`, updateError.message, updateError?.details || updateError?.cause || '');
          console.error(`[TIENDA_UPDATE_CONTENT] Failed payload keys:`, Object.keys(enrichedData));
          return ctx.internalServerError(`Failed to save changes: ${updateError.message}. requestId=${requestId}`);
        }
      } else {
        updated = item;
      }

      const warnings: string[] = [];

      // Republish only if this item was already published before save,
      // unless client explicitly requests draft behavior.
      const shouldRepublish = Boolean(
        config.hasDraftAndPublish &&
        hadPublishedBefore &&
        !inputData.unpublishNow &&
        !inputData.saveAsDraft
      );

      if (shouldRepublish || inputData.publishNow) {
        try {
          await (strapi.documents as any)(config.uid).publish({
            documentId: itemId,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (publishError: any) {
          console.warn(`[TIENDA_UPDATE_CONTENT] Publish failed after save for ${contentType}/${itemId}:`, publishError.message);
          warnings.push(`Content saved as draft. Publish failed: ${publishError.message}`);
        }
      }

      if (inputData.unpublishNow && config.hasDraftAndPublish) {
        try {
          await (strapi.documents as any)(config.uid).unpublish({
            documentId: itemId,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (unpublishError: any) {
          console.warn(`[TIENDA_UPDATE_CONTENT] Unpublish failed for ${contentType}/${itemId}:`, unpublishError.message);
          warnings.push(`Unpublish failed: ${unpublishError.message}`);
        }
      }

      // Fetch the published version for the response so the client sees
      // the final persisted state (not the intermediate draft object from .update()).
      const fetchStatus = ((shouldRepublish || inputData.publishNow) && warnings.length === 0)
        ? 'published'
        : undefined;
      const responseItem = await (strapi.documents as any)(config.uid).findOne({
        documentId: itemId,
        populate: config.defaultPopulate,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
        ...(fetchStatus ? { status: fetchStatus } : {}),
      }) || updated;

      if (!responseItem) {
        console.error(`[TIENDA_UPDATE_CONTENT] No item returned after update for ${contentType}/${itemId}`);
        return ctx.internalServerError(`Content was saved but could not be retrieved. Check Strapi logs. requestId=${requestId}`);
      }

      console.log(`[TIENDA_UPDATE_CONTENT] Saved ${contentType}/${itemId}`, {
        fields: Object.keys(updateData),
        published: (shouldRepublish || inputData.publishNow) && warnings.length === 0,
        hadPublishedBefore,
        locale: requestedLocale || 'default',
      });

      await afterActivities(ctx, `content.${contentType}.update`, { item: responseItem });

      return ctx.send({
        ok: true,
        requestId,
        data: sanitizeContentItem(responseItem, config),
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    } catch (error: any) {
      console.error(`[TIENDA_UPDATE_CONTENT] Unexpected error for ${contentType}/${itemId}:`, error.message);
      if (error.message?.startsWith('Invalid event timezone') || error.message?.startsWith('Invalid event startDate') || error.message?.startsWith('Invalid event endDate')) {
        return ctx.badRequest(error.message);
      }
      if (error.message?.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      if (error.message?.includes('Not Found') || error.message?.includes('not found')) {
        return ctx.notFound(`Content item not found: ${itemId}`);
      }
      return ctx.internalServerError(`Unexpected error: ${error.message}. requestId=${requestId}`);
    }
  },

  /**
   * DELETE /api/tienda/stores/:ref/content/:contentType/:itemId
   * Delete a content item (unpublish + delete)
   */
  async deleteContent(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const { ref, contentType, itemId } = ctx.params;
    const requestId = ensureRequestId(ctx);
    const hardDelete = String(ctx.query?.hardDelete || '').toLowerCase() === 'true';
    const requestedLocale = typeof ctx.query?.locale === 'string'
      ? String(ctx.query.locale).trim()
      : '';

    try {
      const config = resolveContentType(contentType);
      const access = await checkStoreAccess(strapi, user.id, ref);

      if (!access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Rate limit: deletes are destructive, very strict
      const rateLimitKey = `delete:${access.store.documentId}`;
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG.deletesPerMin);
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      // Fetch item to verify ownership
      const item = await (strapi.documents as any)(config.uid).findOne({
        documentId: itemId,
        ...(requestedLocale ? { locale: requestedLocale } : {}),
      });

      if (!item) {
        return ctx.notFound('Content not found');
      }

      if (!verifyItemBelongsToStore(item, access.store.documentId, config)) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Soft-delete by default for draft/publish content: unpublish only.
      if (config.hasDraftAndPublish && !hardDelete) {
        try {
          await (strapi.documents as any)(config.uid).unpublish({
            documentId: itemId,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (unpublishError: any) {
          console.error(`[TIENDA_DELETE_CONTENT] Unpublish failed for ${contentType}/${itemId}:`, unpublishError.message);
          return ctx.internalServerError(`Failed to unpublish: ${unpublishError.message}. requestId=${requestId}`);
        }

        await afterActivities(ctx, `content.${contentType}.unpublish`, { itemId, locale: requestedLocale || null });

        return ctx.send({
          ok: true,
          requestId,
          softDeleted: true,
          message: 'Content unpublished successfully',
        });
      }

      // Hard-delete path (explicit for draft/publish types, default for non draft/publish)
      if (config.hasDraftAndPublish) {
        try {
          await (strapi.documents as any)(config.uid).unpublish({
            documentId: itemId,
            ...(requestedLocale ? { locale: requestedLocale } : {}),
          });
        } catch (err) {
          // Already unpublished, continue to delete
        }
      }

      try {
        await (strapi.documents as any)(config.uid).delete({
          documentId: itemId,
          ...(requestedLocale ? { locale: requestedLocale } : {}),
        });
      } catch (deleteError: any) {
        console.error(`[TIENDA_DELETE_CONTENT] Hard delete failed for ${contentType}/${itemId}:`, deleteError.message);
        return ctx.internalServerError(`Failed to delete: ${deleteError.message}. requestId=${requestId}`);
      }

      await afterActivities(ctx, `content.${contentType}.delete`, { itemId });

      return ctx.send({
        ok: true,
        requestId,
        message: 'Content deleted successfully',
      });
    } catch (error: any) {
      console.error(`[TIENDA_DELETE_CONTENT] Unexpected error for ${contentType}/${itemId}:`, error.message);
      if (error.message?.includes('Unknown content type')) {
        return ctx.badRequest('Invalid content type');
      }
      return ctx.internalServerError(`Unexpected error: ${error.message}. requestId=${requestId}`);
    }
  },

  /**
   * GET /api/tienda/stores/:ref/events/:eventId/rsvps
   * List RSVPs for a store event with pagination and basic filters.
   */
  async listEventRsvps(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    const eventId = String(ctx.params?.eventId || '').trim();

    if (!ref || !eventId) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      const eventConfig = resolveContentType('event');
      const event = await (strapi.documents as any)(eventConfig.uid).findOne({
        documentId: eventId,
        populate: ['stores', 'Thumbnail'],
      });

      if (!event) {
        return ctx.notFound('Event not found');
      }

      if (!verifyItemBelongsToStore(event, access.store.documentId, eventConfig)) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      const { skip, limit } = applyPagination(ctx);
      const filters: any = {
        event: { documentId: { $eq: eventId } },
      };

      if (ctx.query.search) {
        const searchTerm = String(ctx.query.search).trim();
        if (searchTerm.length > 0) {
          filters.$or = [
            { name: { $containsi: searchTerm } },
            { email: { $containsi: searchTerm } },
          ];
        }
      }

      if (typeof ctx.query.approved !== 'undefined') {
        const approved = String(ctx.query.approved).toLowerCase();
        if (approved === 'true' || approved === 'false') {
          filters.approved = { $eq: approved === 'true' };
        }
      }

      if (ctx.query.sync_status && ['pending', 'synced', 'failed'].includes(String(ctx.query.sync_status))) {
        filters.sync_status = { $eq: String(ctx.query.sync_status) };
      }

      const rsvpDocuments = (strapi.documents as any)('api::rsvp.rsvp');
      const [items, total] = await Promise.all([
        rsvpDocuments.findMany({
          filters,
          populate: ['user', 'event'],
          sort: { createdAt: 'desc' },
          skip,
          limit,
        }),
        rsvpDocuments.count({ filters }),
      ]);

      return ctx.send({
        ok: true,
        event: {
          documentId: event.documentId,
          name: event.Name,
          startDate: event.startDate,
          endDate: event.endDate,
          active: event.active,
        },
        data: (items || []).map((item: any) => ({
          documentId: item.documentId,
          name: item.name,
          email: item.email,
          approved: item.approved,
          usd_price: item.usd_price,
          sync_status: item.sync_status || 'pending',
          sendgrid_contact_id: item.sendgrid_contact_id || null,
          sendgrid_list_id: item.sendgrid_list_id || null,
          last_synced_at: item.last_synced_at || null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          user: item.user ? {
            id: item.user.id,
            username: item.user.username,
            email: item.user.email,
          } : null,
        })),
        pagination: {
          page: Math.floor(skip / limit) + 1,
          pageSize: limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error('[TIENDA_EVENT_RSVPS] Failed:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  /**
   * POST /api/tienda/stores/:ref/events/:eventId/rsvps/sync
   * Syncs approved RSVPs to a per-event SendGrid list.
   * Resolves SendGrid credentials from the store's extension config,
   * ensures a list named after the event slug exists, then upserts
   * each pending/failed RSVP email. Writes sync_status and timestamps back.
   */
  async syncEventRsvps(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    const eventId = String(ctx.params?.eventId || '').trim();

    if (!ref || !eventId) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      const eventConfig = resolveContentType('event');
      const event = await (strapi.documents as any)(eventConfig.uid).findOne({
        documentId: eventId,
        populate: ['stores', 'extensions'],
      });

      if (!event) {
        return ctx.notFound('Event not found');
      }

      if (!verifyItemBelongsToStore(event, access.store.documentId, eventConfig)) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      // Resolve SendGrid credentials: prefer event extension, fall back to store extension.
      const storeWithExtensions = await (strapi.documents as any)('api::store.store').findOne({
        documentId: access.store.documentId,
        populate: ['extensions'],
      });

      const allExtensions: any[] = [
        ...(Array.isArray(event.extensions) ? event.extensions : []),
        ...(Array.isArray(storeWithExtensions?.extensions) ? storeWithExtensions.extensions : []),
      ];

      const sgExtension = allExtensions.find(
        (ext: any) => ext?.active !== false && String(ext?.key || '').includes('sendgrid')
      );

      const credentials = resolveSendGridCredentialsForTienda(sgExtension);
      if (!credentials) {
        return ctx.serviceUnavailable(
          'SendGrid credentials unavailable for this store/event. Configure extension credentials or SENDGRID_API_KEY.'
        );
      }
      const sgConfig = sgExtension?.config || {};
      const credentialSource = resolveSendGridCredentialSource(credentials);
      const existingListId = sgConfig.sendgrid_list_id || sgConfig.default_list_id || undefined;
      const listSource = existingListId ? 'configured' : 'auto';

      // Use the store's canonical all-subscribers list for RSVPs.
      // Event segmentation is handled via tags (newsletter-phase-2).
      const listResult = await ensureStoreDefaultSendGridList({
        credentials,
        storeDocumentId: access.store.documentId,
        existingListId,
      });

      if (!listResult.success || !listResult.listId) {
        console.error('[TIENDA_EVENT_RSVP_SYNC] Could not resolve SendGrid list:', listResult.error);
        return ctx.serviceUnavailable(
          `SendGrid list unavailable: ${listResult.message}. Configure a SendGrid extension on this store or set SENDGRID_API_KEY.`
        );
      }

      const listId = listResult.listId;

      // Fetch RSVPs that need syncing (pending or failed), limit to 500 per call.
      const rsvpDocuments = (strapi.documents as any)('api::rsvp.rsvp');
      const rsvps: any[] = await rsvpDocuments.findMany({
        filters: {
          event: { documentId: { $eq: eventId } },
          sync_status: { $in: ['pending', 'failed'] },
        },
        limit: 500,
      });

      const results = { synced: 0, failed: 0, skipped: 0 };
      const now = new Date().toISOString();

      for (const rsvp of rsvps) {
        if (!rsvp?.email) {
          results.skipped++;
          continue;
        }

        const nameParts = String(rsvp.name || '').trim().split(' ');
        const upsertResult = await upsertContactToList({
          credentials,
          listId,
          email: rsvp.email,
          firstName: nameParts[0] || undefined,
          lastName: nameParts.slice(1).join(' ') || undefined,
        });

        const newStatus = upsertResult.success ? 'synced' : 'failed';

        try {
          await rsvpDocuments.update({
            documentId: rsvp.documentId,
            data: {
              sync_status: newStatus,
              sendgrid_list_id: listId,
              ...(upsertResult.contactId ? { sendgrid_contact_id: upsertResult.contactId } : {}),
              last_synced_at: now,
            },
          });
        } catch (updateErr: any) {
          console.warn('[TIENDA_EVENT_RSVP_SYNC] Failed to persist sync status for RSVP:', rsvp.documentId, updateErr.message);
        }

        if (upsertResult.success) {
          results.synced++;
        } else {
          results.failed++;
          console.warn('[TIENDA_EVENT_RSVP_SYNC] Upsert failed for', rsvp.email, upsertResult.error);
        }
      }

      console.log('[TIENDA_EVENT_RSVP_SYNC] Sync complete', {
        eventId,
        listId,
        listCreated: listResult.created,
        listSource,
        credentialSource,
        ...results,
      });

      return ctx.send({
        ok: true,
        data: {
          eventDocumentId: event.documentId,
          eventName: event.Name,
          sendgridListId: listId,
          sendgridListCreated: listResult.created,
          sendgridCredentialSource: credentialSource,
          sendgridListSource: listSource,
          ...results,
          total: rsvps.length,
        },
      });
    } catch (error: any) {
      console.error('[TIENDA_EVENT_RSVP_SYNC] Unexpected error:', error.message);
      return ctx.internalServerError('Request failed');
    }
  },

  /**
   * POST /api/tienda/stores/:ref/upload
   * Upload one or more files for a store through Strapi Upload plugin.
   */
  async uploadStoreMedia(ctx: any) {
    const user = requireUser(ctx);
    if (!user) {
      return;
    }

    const ref = String(ctx.params?.ref || '').trim();
    const requestId = ensureRequestId(ctx);
    if (!ref) {
      return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);
    }

    const badUploadRequest = (message: string, details?: Record<string, any>) => {
      console.warn('[TIENDA_UPLOAD] Bad request', {
        requestId,
        ref,
        ...(details || {}),
      });
      return ctx.badRequest(`${message}. requestId=${requestId}`);
    };

    try {
      const access = await checkStoreAccess(strapi, user.id, ref);
      if (!access.store || !access.hasAccess) {
        return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
      }

      const rateLimitKey = `upload:${access.store.documentId}`;
      const rateLimit = checkRateLimit(rateLimitKey, 120);
      if (!rateLimit.allowed) {
        ctx.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());
        return ctx.tooManyRequests('Rate limit exceeded');
      }

      const normalizedFiles = normalizeUploadFiles(ctx);
      if (normalizedFiles.length === 0) {
        return badUploadRequest('No files provided. Use multipart/form-data with field "files" or "file"', {
          bodyKeys: Object.keys(ctx.request?.body || {}),
          fileKeys: Object.keys(ctx.request?.files || {}),
        });
      }

      if (normalizedFiles.length > 10) {
        return badUploadRequest('Maximum 10 files per request', { fileCount: normalizedFiles.length });
      }

      for (const file of normalizedFiles) {
        const mimeType = String(file?.mimetype || file?.type || '');
        const size = Number(file?.size || 0);

        if (!isAllowedMime(mimeType)) {
          return badUploadRequest(`Unsupported file type: ${mimeType || 'unknown'}`, {
            fileName: file?.name || file?.originalFilename || 'file',
            mimeType,
          });
        }

        if (size <= 0 || size > MAX_UPLOAD_BYTES) {
          return badUploadRequest(
            `Invalid file size for ${file?.name || file?.originalFilename || 'file'}. Max is ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`,
            { fileName: file?.name || file?.originalFilename || 'file', size, maxSize: MAX_UPLOAD_BYTES }
          );
        }

        // Prefix filenames with store slug to keep uploads easy to identify by store.
        const originalName = String(file?.name || file?.originalFilename || 'file');
        const cleanName = originalName.replace(/\s+/g, '-');
        file.name = `${access.store.slug || access.store.documentId}-${Date.now()}-${cleanName}`;
      }

      const body = ctx.request?.body || {};
      const parsedFileInfo = normalizeFileInfo(body.fileInfo, normalizedFiles.length);

      const fileInfo = normalizedFiles.map((file: any, index: number) => {
        const metaFromArray = parsedFileInfo[index] && typeof parsedFileInfo[index] === 'object'
          ? parsedFileInfo[index]
          : {};

        const fallbackAlt = `${access.store.title || access.store.slug || 'store'} upload`;

        return {
          alternativeText: String(
            metaFromArray.alternativeText ||
            metaFromArray.altText ||
            body.alternativeText ||
            body.altText ||
            fallbackAlt,
          ),
          caption: String(metaFromArray.caption || body.caption || ''),
          name: String(metaFromArray.name || file.name),
        };
      });

      const uploadService = strapi.plugin('upload').service('upload');
      const uploaded = await uploadService.upload({
        data: {
          fileInfo,
        },
        files: normalizedFiles,
      });

      // Optional auto-attach to a content record media field.
      const attach = parseJsonIfString(body.attach);
      let attachmentResult: any = null;
      const attachmentWarnings: string[] = [];
      if (attach && typeof attach === 'object') {
        const attachContentType = normalizeContentTypeKey(attach.contentType);
        const attachItemId = String(attach.itemId || '').trim();
        const attachField = String(attach.field || '').trim();
        const attachMode = String(attach.mode || 'replace').trim();

        if (!attachContentType || !attachField) {
          return badUploadRequest('Invalid attach payload. Required: contentType and field', { attach });
        }

        if (attachContentType !== 'store' && !attachItemId) {
          return badUploadRequest('Invalid attach payload. itemId is required for non-store targets', {
            attachContentType,
            attachField,
            attachMode,
          });
        }

        const targetConfig = getMediaTargetConfig(attachContentType);
        const fieldConfig = getMediaFieldConfig(attachContentType, attachField);
        if (!targetConfig || !fieldConfig) {
          return badUploadRequest(`Unsupported attach field "${attachField}" for type "${attachContentType}"`, {
            attachContentType,
            attachField,
          });
        }

        const fieldMode = fieldConfig.mode;

        if (fieldMode === 'single' && uploaded.length > 1) {
          return badUploadRequest(`Field "${attachField}" accepts a single file. Upload one file only`, {
            attachField,
            uploadedCount: uploaded.length,
          });
        }

        if (fieldMode === 'single' && attachMode === 'append') {
          return badUploadRequest('Mode "append" is only valid for multi-file fields', {
            attachField,
            attachMode,
            fieldMode,
          });
        }

        const targetUid = targetConfig.uid;
        const targetDocumentId = attachContentType === 'store'
          ? (attachItemId || access.store.documentId)
          : attachItemId;
        const [rootField, nestedField] = attachField.split('.');
        const effectiveField = nestedField ? rootField : attachField;

        if (attachContentType === 'store' && targetDocumentId !== access.store.documentId) {
          return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
        }

        const contentConfig = attachContentType === 'store'
          ? null
          : resolveContentType(attachContentType);

        const targetItem = await (strapi.documents as any)(targetUid).findOne({
          documentId: targetDocumentId,
          populate: attachContentType === 'store'
            ? [effectiveField]
            : [contentConfig!.storeField, effectiveField],
        });

        if (!targetItem) {
          return ctx.notFound('Target content item not found');
        }

        if (attachContentType !== 'store') {
          if (!verifyItemBelongsToStore(targetItem, access.store.documentId, contentConfig)) {
            return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
          }
        }

        const uploadedIds = uploaded.map((item: any) => item.id).filter(Boolean);
        let nextValue: any;
        const currentFieldValue = nestedField
          ? targetItem?.[rootField]?.[nestedField]
          : targetItem?.[attachField];

        if (fieldMode === 'single') {
          nextValue = uploadedIds[0] || null;
        } else {
          const existingIds = Array.isArray(currentFieldValue)
            ? currentFieldValue.map((item: any) => item?.id).filter(Boolean)
            : [];

          if (attachMode === 'append') {
            nextValue = Array.from(new Set([...existingIds, ...uploadedIds]));
          } else {
            nextValue = uploadedIds;
          }
        }

        let updateData = nestedField
          ? {
            [rootField]: {
              ...(targetItem?.[rootField] || {}),
              [nestedField]: nextValue,
            },
          }
          : {
            [attachField]: nextValue,
          };

        if (contentConfig) {
          updateData = ensureGeneratedSlug(updateData, contentConfig, targetItem);
        }

        await (strapi.documents as any)(targetUid).update({
          documentId: targetDocumentId,
          data: updateData,
        });

        if (attachContentType === 'store') {
          await strapi.documents('api::store.store').publish({ documentId: targetDocumentId });
        } else {
          if (contentConfig.hasDraftAndPublish) {
            try {
              await (strapi.documents as any)(contentConfig.uid).publish({
                documentId: targetDocumentId,
                ...(targetItem?.locale ? { locale: targetItem.locale } : {}),
              });
            } catch (publishError: any) {
              console.warn('[TIENDA_UPLOAD] Publish after attach failed', {
                requestId,
                contentType: attachContentType,
                itemId: targetDocumentId,
                message: publishError?.message || 'Publish failed',
              });
              attachmentWarnings.push(`Media attached, but publish failed: ${publishError?.message || 'Publish failed'}`);
            }
          }
        }

        attachmentResult = {
          contentType: attachContentType,
          itemId: targetDocumentId,
          field: attachField,
          mode: attachMode,
          uploadedCount: uploadedIds.length,
        };
      }

      return ctx.send({
        ok: true,
        requestId,
        data: (uploaded || []).map((item: any) => ({
          id: item.id,
          documentId: item.documentId,
          name: item.name,
          mime: item.mime,
          size: item.size,
          url: item.url,
          provider: item.provider,
          createdAt: item.createdAt,
        })),
        attachment: attachmentResult,
        ...(attachmentWarnings.length > 0 ? { warnings: attachmentWarnings } : {}),
      });
    } catch (error: any) {
      const status = Number(error?.status || error?.statusCode || 500);
      const message = String(error?.message || 'Upload failed');

      console.error('[TIENDA_UPLOAD] Failed:', {
        requestId,
        status,
        message,
        details: error?.details || error?.cause || null,
      });

      if (status >= 400 && status < 500) {
        return ctx.badRequest(`${message}. requestId=${requestId}`);
      }

      return ctx.internalServerError(`Upload failed. requestId=${requestId}`);
    }
  },

  /**
   * GET /api/tienda/stores/:ref/invites
   * List store invites sent via magic link.
   * Returns pending, accepted, and expired invites for the store.
   * The magic `code` value is never returned.
   */
  async listInvites(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);

    const access = await checkStoreAccess(strapi, user.id, ref);
    if (!access?.store || !access?.hasAccess) {
      return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
    }

    const store = access.store;

    const results = await strapi.documents('api::auth-magic.magic-code').findMany({
      filters: {
        store: { documentId: store.documentId },
        purpose: 'store_invite',
      } as any,
      fields: ['email', 'used', 'usedAt', 'expiresAt', 'createdAt', 'updatedAt', 'meta'],
      sort: { updatedAt: 'desc' },
      pagination: { pageSize: 50, page: 1 },
    } as any);

    const now = new Date();
    const latestInviteByEmail = new Map<string, any>();

    for (const row of results || []) {
      const emailKey = String(row?.email || '').trim().toLowerCase();
      if (!emailKey || latestInviteByEmail.has(emailKey)) {
        continue;
      }

      latestInviteByEmail.set(emailKey, row);
    }

    // Collect unique inviter user IDs from meta so we can resolve display names
    const inviterIds = new Set<number>();
    for (const row of latestInviteByEmail.values()) {
      const id = Number(row?.meta?.invitedByUserId);
      if (id) inviterIds.add(id);
    }

    const inviterMap = new Map<number, string>();
    if (inviterIds.size > 0) {
      const inviters = await strapi.query('plugin::users-permissions.user').findMany({
        where: { id: { $in: Array.from(inviterIds) } },
        select: ['id', 'username', 'email'],
      });
      for (const u of inviters || []) {
        inviterMap.set(Number(u.id), u.username || u.email || String(u.id));
      }
    }

    const invites = Array.from(latestInviteByEmail.values()).map((row: any) => {
      const inviterUserId = Number(row?.meta?.invitedByUserId) || null;
      return {
        email: row.email,
        status: row.used
          ? 'accepted'
          : new Date(row.expiresAt) < now
            ? 'expired'
            : 'pending',
        sentAt: row.updatedAt || row.createdAt,
        acceptedAt: row.usedAt || null,
        expiresAt: row.expiresAt,
        invitedBy: inviterUserId ? (inviterMap.get(inviterUserId) || String(inviterUserId)) : null,
      };
    });

    return ctx.send({
      store: { documentId: store.documentId, slug: store.slug },
      invites,
      total: invites.length,
    });
  },

  /**
   * POST /api/tienda/stores/:ref/invite
   * Send a store invite magic link to an email address.
   * Only store owners/members can invite. The recipient clicks the link,
   * verifies the code, gets a JWT, and is connected to the store automatically.
   */
  async inviteUser(ctx: any) {
    const user = requireUser(ctx);
    if (!user) return;

    const ref = String(ctx.params?.ref || '').trim();
    if (!ref) return ctx.notFound(ERRORS.RESOURCE_UNAVAILABLE_MESSAGE);

    const access = await checkStoreAccess(strapi, user.id, ref);
    if (!access?.store || !access?.hasAccess) {
      return ctx.forbidden(ERRORS.STORE_NOT_FOUND);
    }

    const { email } = ctx.request.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return ctx.badRequest('A valid email address is required.');
    }

    const safeEmail = email.trim().toLowerCase();
    const store = access.store;
    const membershipDocuments = (strapi.documents as any)('api::store-membership.store-membership');

    const invitedUser = await strapi.query('plugin::users-permissions.user').findOne({
      where: { email: safeEmail },
    });

    const existingActiveMembership = invitedUser?.id
      ? await membershipDocuments.findMany({
        filters: {
          store: { documentId: store.documentId },
          user: { id: invitedUser.id },
          status: 'active',
        } as any,
        limit: 1,
      }) as any[]
      : [];

    if (
      invitedUser?.id
      && (
        existingActiveMembership.length > 0
        || (
          Array.isArray(store.users)
          && store.users.some((storeUser: any) => Number(storeUser?.id) === Number(invitedUser.id))
        )
      )
    ) {
      return ctx.conflict('That user is already a member of this store.');
    }

    const existingInvites = await strapi.documents('api::auth-magic.magic-code').findMany({
      filters: {
        store: { documentId: store.documentId },
        purpose: 'store_invite',
        email: safeEmail,
      } as any,
      sort: { updatedAt: 'desc' },
      pagination: { pageSize: 100, page: 1 },
    } as any);

    const existingInvite = existingInvites?.[0] || null;
    const duplicateInvites = (existingInvites || []).slice(1);

    try {
      if (duplicateInvites.length > 0) {
        await Promise.all(
          duplicateInvites.map((row: any) => strapi.documents('api::auth-magic.magic-code').update({
            documentId: row.documentId,
            data: {
              used: true,
              usedAt: new Date().toISOString(),
              expiresAt: new Date().toISOString(),
            },
          }))
        );
      }

      const codeData = await strapi.service('api::auth-magic.auth-magic').generateCode(
        safeEmail,
        store.documentId,
        'email',
        ctx.request.ip,
        ctx.request.header['user-agent'],
        {
          purpose: 'store_invite',
          meta: {
            storeDocumentId: store.documentId,
            storeTitle: store.title || store.slug,
            invitedByUserId: user.id,
          },
          expiresInMinutes: 60 * 24, // 24-hour invite window
          existingDocumentId: existingInvite?.documentId,
        }
      );

      const storeDomain = typeof store?.settings?.domain === 'string' && store.settings.domain.trim()
        ? store.settings.domain.trim()
        : 'https://de.markket.place';
      const normalizedStoreDomain = /^https?:\/\//i.test(storeDomain)
        ? storeDomain
        : `https://${storeDomain}`;
      const inviteUrl = new URL(`/auth/magic?code=${codeData.code}`, normalizedStoreDomain).toString();
      const inviterName = String(user?.username || user?.email || '').trim() || undefined;
      const isResend = Boolean(existingInvite);

      const inviteHtml = buildInviteEmailHtml({
        storeName: store.title || store.slug || 'Markketplace',
        storeSlug: store.slug,
        invitedByName: inviterName,
        magicLinkUrl: inviteUrl,
        isResend,
      });

      await strapi.plugin('email').service('email').send({
        to: safeEmail,
        subject: isResend
          ? `${store.title || 'Markketplace'}: your refreshed invite link`
          : `${store.title || 'Markketplace'} invited you to be an editor`,
        text: isResend
          ? `A new invite link is ready: ${inviteUrl}`
          : `You were invited to edit ${store.title || store.slug || 'a store'}: ${inviteUrl}`,
        html: inviteHtml,
      });

      strapi.documents('api::markket.markket').create({
        data: {
          Key: isResend ? 'invite.resent' : 'invite.sent',
          EventType: 'invite',
          EventSubType: isResend ? 'resent' : 'sent',
          Source: 'tienda.inviteUser',
          ReceivedAt: new Date().toISOString(),
          user_key_or_id: String(user.id),
          Content: {
            storeDocumentId: store.documentId,
            storeSlug: store.slug,
            inviteeEmail: safeEmail,
            inviterUserId: user.id,
            isResend,
          },
        },
      } as any).catch((err: any) => {
        console.warn('[TIENDA] invite audit log failed (non-fatal):', err?.message);
      });

      return ctx.send({
        ok: true,
        isResend,
        message: isResend
          ? `Invite re-sent to ${safeEmail} with a new link.`
          : `Invite sent to ${safeEmail}.`,
        store: {
          documentId: store.documentId,
          slug: store.slug,
        },
      });
    } catch (error: any) {
      console.error('[TIENDA] inviteUser failed:', { storeId: store.documentId, error: error?.message });
      if (error?.message?.includes('Rate limit')) {
        return ctx.tooManyRequests('Too many invites sent recently. Please wait before sending another.');
      }
      return ctx.internalServerError('Failed to send invite.');
    }
  },
};
