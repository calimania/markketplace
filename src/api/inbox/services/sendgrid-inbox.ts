interface InboxContext {
  strapi: any;
  ctx: any;
}

import { checkStoreAccess } from '../../../services/api-auth';

function extractEmailAddress(value?: string | null): string | null {
  if (!value) return null;

  const input = String(value).trim();
  if (!input) return null;

  // Prefer address inside angle brackets: "Name <email@domain.com>"
  const angleMatch = input.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  if (angleMatch?.[1]) {
    return angleMatch[1].trim().toLowerCase();
  }

  // Fallback: first email-like token found in the string
  const plainMatch = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (plainMatch?.[0]) {
    return plainMatch[0].trim().toLowerCase();
  }

  return null;
}

function extractDisplayName(value?: string | null): string | null {
  if (!value) return null;

  const input = String(value).trim();
  if (!input) return null;

  const angleMatch = input.match(/^(.*?)<\s*[^<>\s]+@[^<>\s]+\s*>/);
  if (angleMatch?.[1]) {
    const cleaned = angleMatch[1].replace(/^\s*"|"\s*$/g, '').trim();
    if (cleaned && !cleaned.includes('@')) return cleaned;
  }

  if (input.includes('@')) return null;
  const plain = input.replace(/^\s*"|"\s*$/g, '').trim();
  return plain || null;
}

function normalizeMessageId(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = String(value).replace(/^<|>$/g, '').trim();
  return cleaned || null;
}

function normalizeEmailAddress(value?: string | null): string | null {
  return extractEmailAddress(value);
}

function extractRoutingKey(recipientEmail?: string | null): string | null {
  if (!recipientEmail) return null;
  const normalized = String(recipientEmail).trim().toLowerCase();
  const [localPart] = normalized.split('@');
  if (!localPart) return null;

  // Use only the part before @ and ignore any plus-tagging or domain.
  // This keeps routing independent of deployment host and supports aliases like slug+test@domain.com.
  const slug = localPart.split('+')[0].trim();
  return slug || null;
}

function normalizeSubjectForThreading(value?: string | null): string {
  const input = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!input) return 'no-subject';

  // Collapse common reply/forward prefixes so "Re: Re: Subject" stays in one thread.
  const withoutPrefixes = input.replace(/^((re|fw|fwd|aw|sv)\s*:\s*)+/i, '').trim();
  const normalized = (withoutPrefixes || input).toLowerCase();
  return normalized.slice(0, 180);
}

function buildParticipantKey(fromAddress?: string | null, toAddress?: string | null): string {
  const from = normalizeEmailAddress(fromAddress) || 'unknown';
  const to = normalizeEmailAddress(toAddress) || 'unknown';
  return [from, to].sort().join('|');
}

function buildThreadKey(params: {
  fromAddress?: string | null;
  toAddress?: string | null;
  routingKey?: string | null;
  subject?: string | null;
  messageId?: string | null;
}): string {
  const routing = params.routingKey || 'general';
  const messageId = String(normalizeMessageId(params.messageId) || '').toLowerCase();

  // Prefer Message-ID when available so unrelated emails from the same sender don't collapse.
  if (messageId) {
    return [routing, 'msg', messageId].join('::');
  }

  const participants = buildParticipantKey(params.fromAddress, params.toAddress);
  const subject = normalizeSubjectForThreading(params.subject);
  return [routing, 'p', participants, 's', subject].join('::');
}

function parseReferencesHeader(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeMessageId(String(entry || '')))
      .filter((entry): entry is string => Boolean(entry));
  }

  if (typeof value !== 'string') return [];
  return value
    .split(/\s+/)
    .map((entry) => normalizeMessageId(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function formatMessageIdHeader(value: string): string {
  return `<${value}>`;
}

function buildReplySubject(explicitSubject: unknown, fallbackSubject?: string | null): string {
  const explicit = String(explicitSubject || '').trim();
  if (explicit) return explicit;

  const base = String(fallbackSubject || '').trim();
  if (!base) return 'New message';
  if (/^re\s*:/i.test(base)) return base;
  return `Re: ${base}`;
}

function parseEnvelope(payload: any): any {
  if (!payload?.envelope) return null;
  if (typeof payload.envelope === 'string') {
    try {
      return JSON.parse(payload.envelope);
    } catch {
      return null;
    }
  }
  return payload.envelope;
}

function getBody(payload: any): { text?: string; html?: string } {
  return {
    text: payload?.text || null,
    html: payload?.html || null,
  };
}

function buildInboxMetadata(params: {
  source: string;
  threadKey: string;
  routingKey: string | null;
  messageId: string | null;
  subject: string;
  rawTo: unknown;
  rawFrom: unknown;
  fromName?: string | null;
  toName?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  receivedAt?: string;
  sentAt?: string;
  envelope: any;
}) {
  const envelopeFrom = typeof params.envelope?.from === 'string' ? normalizeEmailAddress(params.envelope.from) : null;
  const envelopeToValue = Array.isArray(params.envelope?.to) ? params.envelope.to[0] : params.envelope?.to;
  const envelopeTo = typeof envelopeToValue === 'string' ? normalizeEmailAddress(envelopeToValue) : null;

  return {
    source: params.source,
    threadKey: params.threadKey,
    routingKey: params.routingKey,
    messageId: params.messageId,
    subject: params.subject,
    rawTo: String(params.rawTo ?? ''),
    rawFrom: String(params.rawFrom ?? ''),
    fromName: params.fromName || extractDisplayName(String(params.rawFrom ?? '')),
    toName: params.toName || extractDisplayName(String(params.rawTo ?? '')),
    inReplyTo: normalizeMessageId(params.inReplyTo) || null,
    references: Array.isArray(params.references) ? params.references.map((entry) => normalizeMessageId(entry)).filter((entry): entry is string => Boolean(entry)) : [],
    receivedAt: params.receivedAt || null,
    sentAt: params.sentAt || null,
    envelopeFrom,
    envelopeTo,
  };
}

function getMailDomain(): string {
  return process.env.MARKKET_EMAIL_DOMAIN
    || process.env.MAIL_DOMAIN
    || process.env.EMAIL_DOMAIN
    || process.env.SENDGRID_REPLY_TO_EMAIL?.split('@')[1]
    || 'markket.place';
}

function extractHeaderCandidates(payload: any): string[] {
  const headers = payload?.headers || {};
  const rawValues = [
    payload?.threadKey,
    payload?.thread_key,
    payload?.parentMessageId,
    payload?.parent_message_id,
    payload?.inReplyTo,
    payload?.in_reply_to,
    headers?.['in-reply-to'],
    headers?.references,
    headers?.['message-id'],
    payload?.['message-id'],
    payload?.MessageId,
  ];

  const ids = new Set<string>();
  for (const rawValue of rawValues) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) continue;
    const candidates = rawValue.split(/\s+/);
    for (const candidate of candidates) {
      const cleaned = candidate.replace(/^<|>$/g, '').trim();
      if (cleaned) ids.add(cleaned);
    }
  }

  return Array.from(ids);
}

async function resolveExistingThread(strapi: any, payload: any, routingKey: string | null) {
  const explicitThreadKey = payload?.threadKey || payload?.thread_key || payload?.metadata?.threadKey;
  if (explicitThreadKey) {
    const matches = await strapi.documents('api::inbox.inbox').findMany({
      filters: { ThreadKey: explicitThreadKey, RoutingKey: routingKey },
      sort: { createdAt: 'desc' },
      limit: 1,
    });
    if (matches?.[0]) {
      return matches[0];
    }
  }

  const headerCandidates = extractHeaderCandidates(payload);
  for (const candidate of headerCandidates) {
    const matches = await strapi.documents('api::inbox.inbox').findMany({
      filters: { RoutingKey: routingKey, MessageId: candidate },
      sort: { createdAt: 'desc' },
      limit: 1,
    });
    if (matches?.[0]) {
      return matches[0];
    }
  }

  return null;
}

async function resolveInboxUser(strapi: any, store: any, ctx: any) {
  const authenticatedUser = ctx.state?.user;
  if (authenticatedUser?.id) {
    return authenticatedUser.id;
  }

  if (store?.owner?.id) {
    return store.owner.id;
  }

  if (Array.isArray(store?.users) && store.users[0]?.id) {
    return store.users[0].id;
  }

  return null;
}

function parseBooleanQuery(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return null;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePopulateTokens(value: unknown): Set<string> {
  const rawValues = Array.isArray(value) ? value : [value];
  const tokens: string[] = [];

  for (const rawValue of rawValues) {
    if (typeof rawValue !== 'string') continue;
    for (const token of rawValue.split(',')) {
      const normalized = token.trim().toLowerCase();
      if (normalized) tokens.push(normalized);
    }
  }

  return new Set(tokens);
}

function resolveOutboundIntent(payload: any): { isDraftRequest: boolean; requestedEstado: 'draft' | 'sent' | null } {
  const requestedEstadoRaw = String(payload?.estado || '').trim().toLowerCase();
  const requestedEstado = requestedEstadoRaw === 'draft' || requestedEstadoRaw === 'sent'
    ? requestedEstadoRaw
    : null;

  if (requestedEstadoRaw && !requestedEstado) {
    throw new Error('Invalid `estado`. Allowed values: `draft` or `sent`.');
  }

  const hasDraftFlag = typeof payload?.draft === 'boolean';
  const hasPublishedFlag = typeof payload?.published === 'boolean';
  const draftFlag = payload?.draft === true;
  const publishedFlag = payload?.published === true;

  if (hasDraftFlag && hasPublishedFlag && draftFlag && publishedFlag) {
    throw new Error('Conflicting payload: `draft=true` cannot be combined with `published=true`.');
  }

  if (requestedEstado === 'draft' && publishedFlag) {
    throw new Error('Conflicting payload: `estado=draft` cannot be combined with `published=true`.');
  }

  if (requestedEstado === 'sent' && (payload?.draft === true || payload?.published === false)) {
    throw new Error('Conflicting payload: `estado=sent` cannot be combined with draft inputs.');
  }

  const isDraftRequest = payload?.draft === true || payload?.published === false || requestedEstado === 'draft';
  return { isDraftRequest, requestedEstado: requestedEstado as 'draft' | 'sent' | null };
}

export async function createInboxThreadRecord({ strapi, ctx }: InboxContext) {
  const payload = ctx.request?.body || {};
  const recipientEmail = normalizeEmailAddress(payload?.to);
  const senderEmail = normalizeEmailAddress(payload?.from);
  const recipientName = extractDisplayName(payload?.to);
  const senderName = extractDisplayName(payload?.from);
  const routingKey = extractRoutingKey(recipientEmail);
  const envelope = parseEnvelope(payload);
  const body = getBody(payload);

  if (!recipientEmail || !senderEmail) {
    return { status: 'ignored', reason: 'Missing core email data' };
  }

  if (!routingKey) {
    return { status: 'ignored', reason: 'Invalid routing address format' };
  }

  const store = routingKey
    ? await strapi.documents('api::store.store').findFirst({
      filters: { slug: routingKey },
      populate: ['owner', 'users'],
    })
    : null;

  const inboxUserId = await resolveInboxUser(strapi, store, ctx);
  const existingThread = await resolveExistingThread(strapi, payload, routingKey);
  const messageId = payload?.headers?.['message-id'] || payload?.['message-id'] || null;
  const threadKey = existingThread?.ThreadKey
    || payload?.threadKey
    || payload?.thread_key
    || buildThreadKey({
      fromAddress: senderEmail,
      toAddress: recipientEmail,
      routingKey,
      subject: payload?.subject || 'No subject',
      messageId,
    });
  const messageBody = body.text || body.html || 'No message body';
  const subject = payload?.subject || 'No subject';

  const inboxRecord = await strapi.documents('api::inbox.inbox').create({
    data: {
      Name: subject,
      Message: messageBody,
      email: senderEmail,
      store: store?.documentId ? { connect: [{ documentId: store.documentId }] } : undefined,
      user: inboxUserId ? { connect: [{ id: inboxUserId }] } : undefined,
      parentMessageId: existingThread?.documentId ? { connect: [{ documentId: existingThread.documentId }] } : undefined,
      Direction: 'incoming',
      ThreadKey: threadKey,
      RoutingKey: routingKey || null,
      FromAddress: senderEmail,
      ToAddress: recipientEmail,
      MessageId: messageId,
      BodyHtml: body.html || null,
      Metadata: buildInboxMetadata({
        source: 'sendgrid-inbound',
        threadKey,
        routingKey,
        messageId,
        subject,
        rawTo: payload?.to ?? recipientEmail,
        rawFrom: payload?.from ?? senderEmail,
        fromName: senderName,
        toName: recipientName,
        receivedAt: new Date().toISOString(),
        envelope,
      }),
      Estado: 'new',
    },
  });

  const shouldPublishInbound = Boolean(store?.documentId);
  if (shouldPublishInbound && inboxRecord?.documentId) {
    await strapi.documents('api::inbox.inbox').publish({
      documentId: inboxRecord.documentId,
    });
  }

  return {
    status: 'success',
    data: {
      id: inboxRecord.documentId,
      threadKey,
      routingKey,
      store: store?.slug || null,
      published: shouldPublishInbound,
    },
  };
}

export async function sendSendGridOutboundEmail({ strapi, ctx }: InboxContext) {
  const payload = ctx.request?.body || {};
  const toAddress = normalizeEmailAddress(payload?.to);
  const toName = extractDisplayName(payload?.to);
  const plainText = payload?.text || payload?.body || 'No message body';
  const htmlBody = payload?.html || null;
  const { isDraftRequest } = resolveOutboundIntent(payload);

  if (!toAddress) {
    throw new Error('Missing recipient address');
  }

  const explicitThreadKey = String(payload?.threadKey || payload?.thread_key || '').trim();
  const explicitFromAddress = normalizeEmailAddress(payload?.from);

  // Resolve thread context first when provided, so replies to customers do not depend on `to` containing store slug.
  const explicitThread = explicitThreadKey
    ? await strapi.documents('api::inbox.inbox').findMany({
      filters: { ThreadKey: explicitThreadKey },
      sort: { createdAt: 'desc' },
      limit: 1,
    })
    : [];
  const threadRecord = explicitThread?.[0] || null;

  // Priority: thread routing -> explicit from mailbox -> legacy fallback from recipient.
  const routingKey = threadRecord?.RoutingKey
    || extractRoutingKey(explicitFromAddress)
    || extractRoutingKey(toAddress);
  if (!routingKey) {
    throw new Error('Unable to resolve store routing key. Provide `threadKey` or a store `from` address like `slug@domain.com`.');
  }

  const store = await strapi.documents('api::store.store').findFirst({
    filters: { slug: routingKey },
    populate: ['owner', 'users'],
  });

  if (!store?.documentId) {
    throw new Error(`Store not found for routing key: ${routingKey}`);
  }

  const authenticatedUserId = ctx.state?.user?.id;
  if (authenticatedUserId) {
    const access = await checkStoreAccess(strapi, authenticatedUserId, store.documentId || routingKey);
    if (!access?.store || !access?.hasAccess) {
      throw new Error('Store not found or access denied');
    }
  }

  const inboxUserId = await resolveInboxUser(strapi, store, ctx);
  const existingThread = threadRecord || await resolveExistingThread(strapi, payload, routingKey);
  const fromEmail = payload?.from || `${routingKey}@${getMailDomain()}`;
  const fromName = extractDisplayName(payload?.from);
  const subject = buildReplySubject(
    payload?.subject,
    existingThread?.Name || existingThread?.Metadata?.subject || null,
  );
  const threadKey = existingThread?.ThreadKey
    || payload?.threadKey
    || payload?.thread_key
    || buildThreadKey({
      fromAddress: fromEmail,
      toAddress,
      routingKey,
      subject,
      messageId: null,
    });

  // Keep outbound threading deterministic and server-owned.
  // We do not trust client-supplied in-reply-to/references headers.
  const fallbackThreadMessageId = normalizeMessageId(existingThread?.MessageId);
  const metadataReferences = parseReferencesHeader(existingThread?.Metadata?.references);

  const inReplyTo = fallbackThreadMessageId || null;
  const references = Array.from(new Set([
    ...metadataReferences,
    ...(inReplyTo ? [inReplyTo] : []),
  ])).filter(Boolean);

  const outboundHeaders: Record<string, string> = {};
  if (inReplyTo) {
    outboundHeaders['In-Reply-To'] = formatMessageIdHeader(inReplyTo);
  }
  if (references.length > 0) {
    outboundHeaders.References = references.map((entry) => formatMessageIdHeader(entry)).join(' ');
  }

  const emailData = {
    to: toAddress,
    from: fromEmail,
    replyTo: fromEmail,
    subject,
    text: plainText,
    html: htmlBody || `<p>${plainText}</p>`,
    ...(Object.keys(outboundHeaders).length > 0 ? { headers: outboundHeaders } : {}),
  };

  if (!isDraftRequest) {
    const sgMail = await import('@sendgrid/mail');
    const mail = sgMail.default;
    const apiKey = process.env.SENDGRID_API_KEY;

    if (!apiKey) {
      throw new Error('SendGrid API key is not configured');
    }

    mail.setApiKey(apiKey);
    await mail.send(emailData);
  }

  const outboundRecord = await strapi.documents('api::inbox.inbox').create({
    data: {
      Name: subject,
      Message: plainText,
      email: toAddress,
      store: store?.documentId ? { connect: [{ documentId: store.documentId }] } : undefined,
      user: inboxUserId ? { connect: [{ id: inboxUserId }] } : undefined,
      parentMessageId: existingThread?.documentId ? { connect: [{ documentId: existingThread.documentId }] } : undefined,
      Direction: 'outgoing',
      ThreadKey: threadKey,
      RoutingKey: routingKey,
      FromAddress: fromEmail,
      ToAddress: toAddress,
      BodyHtml: htmlBody || null,
      Metadata: buildInboxMetadata({
        source: isDraftRequest ? 'sendgrid-outbound-draft' : 'sendgrid-outbound',
        threadKey,
        routingKey,
        messageId: null,
        subject,
        rawTo: payload?.to ?? toAddress,
        rawFrom: payload?.from ?? fromEmail,
        fromName,
        toName,
        inReplyTo,
        references,
        sentAt: isDraftRequest ? undefined : new Date().toISOString(),
        envelope: { from: fromEmail, to: toAddress },
      }),
      Estado: isDraftRequest ? 'draft' : 'sent',
    },
  });

  if (!isDraftRequest && outboundRecord?.documentId) {
    await strapi.documents('api::inbox.inbox').publish({
      documentId: outboundRecord.documentId,
    });
  }

  return {
    status: 'success',
    data: {
      id: outboundRecord.documentId,
      threadKey,
      routingKey,
      store: store?.slug || null,
      to: toAddress,
      from: fromEmail,
      sent: !isDraftRequest,
      published: !isDraftRequest,
      threading: {
        inReplyTo,
        references,
      },
    },
  };
}

export async function sendSendGridOutboundReplyByThread({ strapi, ctx }: InboxContext) {
  const userId = ctx.state?.user?.id;
  const threadId = String(ctx.params?.threadId || ctx.params?.id || ctx.request?.body?.threadId || '').trim();

  if (!userId) {
    throw new Error('Missing user context');
  }

  if (!threadId) {
    throw new Error('Missing thread id');
  }

  const anchorRows = await strapi.documents('api::inbox.inbox').findMany({
    filters: {
      user: { id: userId },
      documentId: threadId,
    },
    sort: { createdAt: 'desc' },
    limit: 1,
  });

  const anchor = anchorRows?.[0];
  if (!anchor) {
    throw new Error('Thread not found');
  }

  const threadKey = anchor.ThreadKey || anchor.documentId;
  const threadRows = await strapi.documents('api::inbox.inbox').findMany({
    filters: {
      user: { id: userId },
      ThreadKey: threadKey,
    },
    sort: { createdAt: 'desc' },
    limit: 200,
  });

  if (!threadRows?.length) {
    throw new Error('Thread not found');
  }

  const latest = threadRows[0];
  const latestIncoming = threadRows.find((row: any) => row.Direction === 'incoming') || null;
  const inferredToAddress = normalizeEmailAddress(
    latestIncoming?.FromAddress
    || latestIncoming?.email
    || latest?.ToAddress
    || latest?.email,
  );

  if (!inferredToAddress) {
    throw new Error('Cannot infer customer email from thread');
  }

  ctx.request.body = {
    ...(ctx.request?.body || {}),
    to: inferredToAddress,
    threadKey,
    subject: buildReplySubject(
      ctx.request?.body?.subject,
      latestIncoming?.Name || latest?.Name || anchor?.Name || null,
    ),
  };

  return sendSendGridOutboundEmail({ strapi, ctx });
}

export async function getInboxThreadById({ strapi, ctx }: InboxContext) {
  const userId = ctx.state?.user?.id;
  const threadId = String(ctx.params?.threadId || ctx.params?.id || '').trim();

  if (!userId) {
    return { status: 'unauthorized', data: null };
  }

  if (!threadId) {
    throw new Error('Missing thread id');
  }

  const anchorRows = await strapi.documents('api::inbox.inbox').findMany({
    filters: {
      user: { id: userId },
      documentId: threadId,
    },
    populate: ['store'],
    sort: { createdAt: 'desc' },
    limit: 1,
  });

  const anchor = anchorRows?.[0];
  if (!anchor) {
    throw new Error('Thread not found');
  }

  const threadKey = anchor.ThreadKey || anchor.documentId;
  const originalQuery = ctx.request?.query || {};
  const originalScopedStore = ctx.state?.inboxStore;

  try {
    ctx.request.query = {
      ...originalQuery,
      threadKey,
      page: 1,
      pageSize: 1,
      includeMessages: originalQuery?.includeMessages ?? 'true',
    };

    if (anchor?.store?.documentId) {
      ctx.state.inboxStore = anchor.store;
    }

    const threadResult = await listInboxThreadsForUser({ strapi, ctx });
    const thread = Array.isArray(threadResult?.data) ? threadResult.data[0] : null;

    if (!thread) {
      throw new Error('Thread not found');
    }

    return {
      status: 'success',
      data: thread,
      meta: {
        threadId,
        threadKey,
        includeMessages: threadResult?.meta?.includeMessages,
        populate: threadResult?.meta?.populate,
      },
    };
  } finally {
    ctx.request.query = originalQuery;
    ctx.state.inboxStore = originalScopedStore;
  }
}

export async function listInboxThreadsForUser({ strapi, ctx }: InboxContext) {
  const userId = ctx.state?.user?.id;
  if (!userId) {
    return { status: 'unauthorized', data: [] };
  }

  const query = ctx.request?.query || {};
  const search = String(query.q || query.search || '').trim().toLowerCase();
  const storeFilter = String(query.store || query.storeSlug || '').trim().toLowerCase();
  const storeIdFilter = String(query.storeId || query.storeDocumentId || '').trim();
  const directionFilter = String(query.direction || '').trim().toLowerCase();
  const estadoFilter = String(query.estado || '').trim().toLowerCase();
  const publicationFilter = String(query.publication || query.publicationState || '').trim().toLowerCase();
  const threadKeyFilter = String(query.threadKey || '').trim();
  const archivedFilterInput = parseBooleanQuery(query.archived);
  // Default UX: hide archived threads unless the client explicitly asks for archived=true.
  const archivedFilter = typeof archivedFilterInput === 'boolean' ? archivedFilterInput : false;
  const readFilter = parseBooleanQuery(query.read);
  const includeMessages = parseBooleanQuery(query.includeMessages) !== false;
  const populateTokens = parsePopulateTokens(query.populate);
  const populateAll = ['*', 'all', 'true', '1', 'full'].some((token) => populateTokens.has(token));
  const includeStoreDetails = populateAll || populateTokens.has('store');
  const includeUserDetails = populateAll || populateTokens.has('user');
  const includeMetadata = populateAll || populateTokens.has('metadata');
  const includeMessageDetails = includeMessages && (populateAll || populateTokens.has('messages') || populateTokens.has('message'));

  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize || query.limit, 20), 100);
  const sortByRaw = String(query.sortBy || query.sort || 'latestMessageAt').trim();
  const sortOrderRaw = String(query.sortOrder || query.order || 'desc').trim().toLowerCase();
  const sortOrder = sortOrderRaw === 'asc' ? 'asc' : 'desc';
  const sortBy = ['latestMessageAt', 'subject', 'store', 'direction', 'estado', 'publicationState'].includes(sortByRaw)
    ? sortByRaw
    : 'latestMessageAt';

  const scopedStore = ctx.state?.inboxStore;
  const scopedStoreDocumentId = scopedStore?.documentId || null;

  const inboxRecords = await strapi.documents('api::inbox.inbox').findMany({
    filters: {
      user: { id: userId },
      ...(scopedStoreDocumentId ? { store: { documentId: scopedStoreDocumentId } } : {}),
    },
    sort: { createdAt: 'desc' },
    populate: ['store', 'user'],
  });

  const grouped = new Map<string, any[]>();
  for (const row of inboxRecords) {
    const key = row.ThreadKey || row.documentId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const threads = Array.from(grouped.values()).map((items) => {
    const sortedItems = [...items].sort((a, b) => {
      const aDate = new Date(a.createdAt || 0).getTime();
      const bDate = new Date(b.createdAt || 0).getTime();
      return aDate - bDate;
    });
    const latest = sortedItems[sortedItems.length - 1] || sortedItems[0];
    const latestMetadata = latest?.Metadata || {};
    const fromEmail = latest?.FromAddress || latest?.email || latestMetadata?.envelopeFrom || null;
    const toEmail = latest?.ToAddress || latestMetadata?.envelopeTo || null;
    const fromName = latestMetadata?.fromName || extractDisplayName(latestMetadata?.rawFrom) || null;
    const toName = latestMetadata?.toName || extractDisplayName(latestMetadata?.rawTo) || null;
    const contactEmail = latest?.Direction === 'incoming' ? fromEmail : toEmail;
    const contactName = latest?.Direction === 'incoming' ? fromName : toName;

    const thread: Record<string, any> = {
      id: latest?.documentId,
      threadKey: latest?.ThreadKey || latest?.documentId,
      subject: latest?.Name || 'Conversation',
      store: latest?.store?.slug || null,
      storeId: latest?.store?.documentId || null,
      direction: latest?.Direction || 'incoming',
      estado: latest?.Estado || 'new',
      publicationState: latest?.publishedAt ? 'published' : 'draft',
      published: Boolean(latest?.publishedAt),
      fromAddress: fromEmail,
      fromName,
      toAddress: toEmail,
      toName,
      contact: {
        name: contactName,
        email: contactEmail,
      },
      latestMessageId: normalizeMessageId(latest?.MessageId) || null,
      replyHints: {
        inReplyTo: normalizeMessageId(latest?.MessageId) || null,
        references: parseReferencesHeader(latestMetadata?.references),
      },
      isArchived: Boolean(latest?.Archived),
      isRead: latest?.Estado !== 'new',
      latestMessageAt: latest?.createdAt || null,
      messages: includeMessages ? sortedItems.map((item) => {
        const itemMetadata = item.Metadata || {};
        const itemFromName = itemMetadata?.fromName || extractDisplayName(itemMetadata?.rawFrom) || null;
        const itemToName = itemMetadata?.toName || extractDisplayName(itemMetadata?.rawTo) || null;
        const message: Record<string, any> = {
          id: item.documentId,
          subject: item.Name,
          body: item.Message,
          direction: item.Direction,
          email: item.email,
          fromName: itemFromName,
          toName: itemToName,
          createdAt: item.createdAt,
        };

        if (includeMetadata) {
          message.metadata = item.Metadata || null;
        }

        if (includeMessageDetails) {
          message.estado = item.Estado || 'new';
          message.publicationState = item.publishedAt ? 'published' : 'draft';
          message.published = Boolean(item.publishedAt);
          message.isArchived = Boolean(item.Archived);
          message.fromAddress = item.FromAddress || null;
          message.toAddress = item.ToAddress || null;
          message.messageId = item.MessageId || null;
          message.bodyHtml = item.BodyHtml || null;
          message.routingKey = item.RoutingKey || null;
        }

        return message;
      }) : [],
    };

    if (includeMetadata) {
      thread.metadata = latest?.Metadata || null;
    }

    if (includeStoreDetails && latest?.store) {
      thread.storeDetails = {
        documentId: latest.store.documentId || null,
        slug: latest.store.slug || null,
        title: latest.store.title || latest.store.Name || null,
      };
    }

    if (includeUserDetails && latest?.user) {
      thread.user = {
        id: latest.user.id || null,
        username: latest.user.username || null,
        email: latest.user.email || null,
      };
    }

    return thread;
  });

  let filtered = threads;

  if (threadKeyFilter) {
    filtered = filtered.filter((thread) => thread.threadKey === threadKeyFilter);
  }

  if (storeFilter) {
    filtered = filtered.filter((thread) => String(thread.store || '').toLowerCase() === storeFilter);
  }

  if (storeIdFilter) {
    filtered = filtered.filter((thread) => String(thread.storeId || '') === storeIdFilter);
  }

  if (directionFilter) {
    filtered = filtered.filter((thread) => String(thread.direction || '').toLowerCase() === directionFilter);
  }

  if (estadoFilter) {
    filtered = filtered.filter((thread) => String(thread.estado || '').toLowerCase() === estadoFilter);
  }

  if (publicationFilter) {
    filtered = filtered.filter((thread) => String(thread.publicationState || '').toLowerCase() === publicationFilter);
  }

  if (typeof archivedFilter === 'boolean') {
    filtered = filtered.filter((thread) => thread.isArchived === archivedFilter);
  }

  if (typeof readFilter === 'boolean') {
    filtered = filtered.filter((thread) => thread.isRead === readFilter);
  }

  if (search) {
    filtered = filtered.filter((thread) => {
      const inSubject = String(thread.subject || '').toLowerCase().includes(search);
      const inStore = String(thread.store || '').toLowerCase().includes(search);
      const inStoreId = String(thread.storeId || '').toLowerCase().includes(search);
      const inThreadKey = String(thread.threadKey || '').toLowerCase().includes(search);
      const inMessages = thread.messages.some((message: any) => {
        const body = String(message.body || '').toLowerCase();
        const email = String(message.email || '').toLowerCase();
        const subject = String(message.subject || '').toLowerCase();
        return body.includes(search) || email.includes(search) || subject.includes(search);
      });
      return inSubject || inStore || inStoreId || inThreadKey || inMessages;
    });
  }

  filtered.sort((a, b) => {
    const direction = sortOrder === 'asc' ? 1 : -1;

    if (sortBy === 'latestMessageAt') {
      const aTime = new Date(a.latestMessageAt || 0).getTime();
      const bTime = new Date(b.latestMessageAt || 0).getTime();
      return (aTime - bTime) * direction;
    }

    const left = String((a as any)[sortBy] || '').toLowerCase();
    const right = String((b as any)[sortBy] || '').toLowerCase();
    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return 0;
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageData = filtered.slice(start, end);

  return {
    status: 'success',
    data: pageData,
    meta: {
      pagination: {
        page: currentPage,
        pageSize,
        pageCount,
        total,
      },
      filters: {
        search: search || null,
        store: storeFilter || null,
        storeId: storeIdFilter || null,
        direction: directionFilter || null,
        estado: estadoFilter || null,
        publication: publicationFilter || null,
        archived: archivedFilter,
        read: readFilter,
        threadKey: threadKeyFilter || null,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
      includeMessages,
      populate: {
        requested: Array.from(populateTokens),
        store: includeStoreDetails,
        user: includeUserDetails,
        metadata: includeMetadata,
        messages: includeMessageDetails,
      },
    },
  };
}

export async function updateInboxThreadState({ strapi, ctx }: InboxContext) {
  const userId = ctx.state?.user?.id;
  const threadKey = ctx.params?.threadKey || ctx.request?.body?.threadKey;
  const action = ctx.request?.body?.action;

  if (!userId || !threadKey) {
    throw new Error('Missing thread key or user context');
  }

  const inboxRecords = await strapi.documents('api::inbox.inbox').findMany({
    filters: {
      user: { id: userId },
      ThreadKey: threadKey,
    },
    fields: ['documentId', 'Archived', 'Estado', 'publishedAt'],
  });

  if (!inboxRecords?.length) {
    throw new Error('Thread not found');
  }

  const nextArchived = action === 'archive' ? true : action === 'unarchive' ? false : undefined;
  const nextEstado = action === 'read' ? 'read' : action === 'unread' ? 'new' : undefined;

  for (const record of inboxRecords) {
    const updateData: Record<string, any> = {};
    if (typeof nextArchived === 'boolean') {
      updateData.Archived = nextArchived;
    }
    if (nextEstado) {
      updateData.Estado = nextEstado;
    }

    await strapi.documents('api::inbox.inbox').update({
      documentId: record.documentId,
      status: record?.publishedAt ? 'published' : 'draft',
      data: updateData,
    });
  }

  return {
    status: 'success',
    data: {
      threadKey,
      action,
      archived: nextArchived,
    },
  };
}
