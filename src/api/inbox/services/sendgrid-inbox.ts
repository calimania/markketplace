interface InboxContext {
  strapi: any;
  ctx: any;
}

function normalizeEmailAddress(value?: string | null): string | null {
  if (!value) return null;
  return String(value).trim().toLowerCase();
}

function extractRoutingKey(recipientEmail?: string | null): string | null {
  if (!recipientEmail) return null;
  const match = String(recipientEmail).trim().match(/^([^@]+)@/);
  return match ? match[1] : null;
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

  const store = await strapi.documents('api::store.store').findFirst({
    filters: { slug: routingKey },
    populate: ['owner', 'users'],
  });

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
      store: store?.id ? { connect: [{ id: store.id }] } : undefined,
      user: inboxUserId ? { connect: [{ id: inboxUserId }] } : undefined,
      parentMessageId: existingThread?.documentId ? { connect: [{ documentId: existingThread.documentId }] } : undefined,
      Direction: 'incoming',
      ThreadKey: threadKey,
      RoutingKey: routingKey,
      FromAddress: senderEmail,
      ToAddress: recipientEmail,
      MessageId: messageId,
      BodyHtml: body.html || null,
      Metadata: {
        envelope,
        source: 'sendgrid-inbound',
        receivedAt: new Date().toISOString(),
        rawTo: recipientEmail,
        rawFrom: senderEmail,
      },
      Status: 'new',
    },
  });

  return {
    status: 'success',
    data: {
      id: inboxRecord.documentId,
      threadKey,
      routingKey,
      store: store?.slug || null,
    },
  };
}

export async function sendSendGridOutboundEmail({ strapi, ctx }: InboxContext) {
  const payload = ctx.request?.body || {};
  const toAddress = normalizeEmailAddress(payload?.to);
  const subject = payload?.subject || 'New message';
  const plainText = payload?.text || payload?.body || 'No message body';
  const htmlBody = payload?.html || null;

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

  const sgMail = await import('@sendgrid/mail');
  const mail = sgMail.default;
  const apiKey = process.env.SENDGRID_API_KEY;

  if (!apiKey) {
    throw new Error('SendGrid API key is not configured');
  }

  mail.setApiKey(apiKey);
  await mail.send(emailData);

  await strapi.documents('api::inbox.inbox').create({
    data: {
      Name: subject,
      Message: plainText,
      email: toAddress,
      store: store?.id ? { connect: [{ id: store.id }] } : undefined,
      user: inboxUserId ? { connect: [{ id: inboxUserId }] } : undefined,
      parentMessageId: existingThread?.documentId ? { connect: [{ documentId: existingThread.documentId }] } : undefined,
      Direction: 'outgoing',
      ThreadKey: threadKey,
      RoutingKey: routingKey,
      FromAddress: fromEmail,
      ToAddress: toAddress,
      BodyHtml: htmlBody || null,
      Metadata: {
        source: 'sendgrid-outbound',
        sentAt: new Date().toISOString(),
        routingKey,
      },
      Status: 'sent',
    },
  });

  return {
    status: 'success',
    data: {
      threadKey,
      routingKey,
      store: store?.slug || null,
      to: toAddress,
      from: fromEmail,
    },
  };
}

export async function listInboxThreadsForUser({ strapi, ctx }: InboxContext) {
  const userId = ctx.state?.user?.id;
  if (!userId) {
    return { status: 'unauthorized', data: [] };
  }

  const inboxRecords = await strapi.documents('api::inbox.inbox').findMany({
    filters: {
      user: { id: userId },
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
      direction: latest?.Direction || 'incoming',
      isArchived: Boolean(latest?.Archived),
      isRead: latest?.Status !== 'new',
      latestMessageAt: latest?.createdAt || null,
      messages: sortedItems.map((item) => ({
        id: item.documentId,
        subject: item.Name,
        body: item.Message,
        direction: item.Direction,
        email: item.email,
        createdAt: item.createdAt,
      })),
    };
  });

  return { status: 'success', data: threads };
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
