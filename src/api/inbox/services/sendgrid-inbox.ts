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

function buildThreadKey(fromAddress?: string | null, toAddress?: string | null, routingKey?: string | null): string {
  const from = normalizeEmailAddress(fromAddress) || 'unknown';
  const to = normalizeEmailAddress(toAddress) || 'unknown';
  return [routingKey || 'general', from, to].join('::');
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

export async function createInboxThreadRecord({ strapi, ctx }: InboxContext) {
  const payload = ctx.request?.body || {};
  const recipientEmail = normalizeEmailAddress(payload?.to);
  const senderEmail = normalizeEmailAddress(payload?.from);
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
  const threadKey = existingThread?.ThreadKey || payload?.threadKey || payload?.thread_key || buildThreadKey(senderEmail, recipientEmail, routingKey);
  const messageBody = body.text || body.html || 'No message body';
  const subject = payload?.subject || 'No subject';
  const messageId = payload?.headers?.['message-id'] || payload?.['message-id'] || null;

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
        receivedAt: new Date().toISOString(),
        envelope,
      }),
      Status: 'new',
    },
  });

  const shouldPublishInbound = Boolean(store?.documentId);
  if (shouldPublishInbound && inboxRecord?.documentId) {
    const publishedInbound = await strapi.documents('api::inbox.inbox').publish({
      documentId: inboxRecord.documentId,
    });

    // Defensive fallback: ensure publishedAt is set even if publish result is unexpectedly empty.
    if (!publishedInbound?.publishedAt) {
      await strapi.documents('api::inbox.inbox').update({
        documentId: inboxRecord.documentId,
        data: { publishedAt: new Date().toISOString() },
      });
    }
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
  const subject = payload?.subject || 'New message';
  const plainText = payload?.text || payload?.body || 'No message body';
  const htmlBody = payload?.html || null;
  const isDraftRequest = payload?.published === false || payload?.draft === true || payload?.status === 'draft';

  if (!toAddress) {
    throw new Error('Missing recipient address');
  }

  const routingKey = extractRoutingKey(toAddress);
  if (!routingKey) {
    throw new Error('Invalid routing address format');
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
  const existingThread = await resolveExistingThread(strapi, payload, routingKey);
  const fromEmail = payload?.from || `${routingKey}@${getMailDomain()}`;
  const threadKey = existingThread?.ThreadKey || payload?.threadKey || payload?.thread_key || buildThreadKey(fromEmail, toAddress, routingKey);

  const emailData = {
    to: toAddress,
    from: fromEmail,
    replyTo: fromEmail,
    subject,
    text: plainText,
    html: htmlBody || `<p>${plainText}</p>`,
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
        sentAt: isDraftRequest ? undefined : new Date().toISOString(),
        envelope: { from: fromEmail, to: toAddress },
      }),
      Status: isDraftRequest ? 'draft' : 'sent',
    },
  });

  if (!isDraftRequest && outboundRecord?.documentId) {
    const publishedOutbound = await strapi.documents('api::inbox.inbox').publish({
      documentId: outboundRecord.documentId,
    });

    // Defensive fallback: ensure publishedAt is set even if publish result is unexpectedly empty.
    if (!publishedOutbound?.publishedAt) {
      await strapi.documents('api::inbox.inbox').update({
        documentId: outboundRecord.documentId,
        data: { publishedAt: new Date().toISOString() },
      });
    }
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
    },
  };
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
  const statusFilter = String(query.status || '').trim().toLowerCase();
  const threadKeyFilter = String(query.threadKey || '').trim();
  const archivedFilter = parseBooleanQuery(query.archived);
  const readFilter = parseBooleanQuery(query.read);
  const includeMessages = parseBooleanQuery(query.includeMessages) !== false;

  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize || query.limit, 20), 100);
  const sortByRaw = String(query.sortBy || query.sort || 'latestMessageAt').trim();
  const sortOrderRaw = String(query.sortOrder || query.order || 'desc').trim().toLowerCase();
  const sortOrder = sortOrderRaw === 'asc' ? 'asc' : 'desc';
  const sortBy = ['latestMessageAt', 'subject', 'store', 'direction', 'status'].includes(sortByRaw)
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
    return {
      id: latest?.documentId,
      threadKey: latest?.ThreadKey || latest?.documentId,
      subject: latest?.Name || 'Conversation',
      store: latest?.store?.slug || null,
      storeId: latest?.store?.documentId || null,
      direction: latest?.Direction || 'incoming',
      status: latest?.Status || 'new',
      isArchived: Boolean(latest?.Archived),
      isRead: latest?.Status !== 'new',
      latestMessageAt: latest?.createdAt || null,
      messages: includeMessages ? sortedItems.map((item) => ({
        id: item.documentId,
        subject: item.Name,
        body: item.Message,
        direction: item.Direction,
        email: item.email,
        createdAt: item.createdAt,
      })) : [],
    };
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

  if (statusFilter) {
    filtered = filtered.filter((thread) => String(thread.status || '').toLowerCase() === statusFilter);
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
        status: statusFilter || null,
        archived: archivedFilter,
        read: readFilter,
        threadKey: threadKeyFilter || null,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
      includeMessages,
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
    fields: ['documentId', 'Archived', 'Status'],
  });

  if (!inboxRecords?.length) {
    throw new Error('Thread not found');
  }

  const nextArchived = action === 'archive';
  const nextStatus = action === 'read' ? 'read' : action === 'unread' ? 'new' : undefined;

  for (const record of inboxRecords) {
    const updateData: Record<string, any> = {};
    if (typeof nextArchived === 'boolean') {
      updateData.Archived = nextArchived;
    }
    if (nextStatus) {
      updateData.Status = nextStatus;
    }

    await strapi.documents('api::inbox.inbox').update({
      documentId: record.documentId,
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
