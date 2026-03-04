/**
 * SendGrid Marketing Campaigns API Test Service
 * Tests API key scopes and connection
 *
 * TODO(newsletter-phase-1): Add sync abstraction methods
 * - resolveStoreSendGridExtension(storeDocumentId)
 * - ensureSendGridListExists({ storeDocumentId, listDocumentId })
 * - upsertContactToList({ email, profile, sendGridListId })
 * - syncSubscriberMemberships({ subscriberDocumentId, listDocumentIds })
 * - sendWelcomeEmail({ subscriberDocumentId, listDocumentId })
 * - getSyncStatus({ subscriberDocumentId })
 */

interface SendGridCredentials {
  api_key: string;
  use_default?: boolean;
}

interface SendGridConfig {
  sender_id?: string;
  default_list_id?: string;
  from_email?: string;
  from_name?: string;
  unsubscribe_group_id?: string;
}

interface SendGridTestResult {
  success: boolean;
  status: 'ready' | 'ready_with_warnings' | 'missing_scopes';
  message: string;
  data?: {
    account: {
      username: string;
      email: string;
      company: string | null;
    };
    scopes_detected: {
      marketing_lists: boolean;
      marketing_contacts: boolean;
      verified_senders: boolean;
      mail_send: boolean;
    };
    capabilities: {
      can_create_lists: boolean;
      can_manage_contacts: boolean;
      can_send_campaigns: boolean;
      has_verified_sender: boolean;
      can_send_welcome_email: boolean;
    };
    stats: {
      total_contacts: number | null;
      lists_count: number;
      sender_verified: boolean;
    };
    configured_sender: any;
    missing_scopes: string[];
    recommendations: string[];
    debug_scopes: {
      endpoint_accessible: boolean;
      has_mail_send_scope: boolean;
      scopes_count: number;
      sample: string[];
    };
    debug_auth: {
      key_source: string;
      key_fingerprint: string;
    };
    pricing_info: {
      note: string;
      plans: Record<string, string>;
      monitoring: string;
    };
  };
  error?: string;
  details?: string;
  next_steps?: string[];
}

interface UserProfile {
  username: string;
  email: string;
  company?: string;
}

interface ListsResult {
  success: boolean;
  count: number;
}

interface ContactsResult {
  success: boolean;
  count: number | null;
}

interface ScopesResult {
  success: boolean;
  scopes: string[];
}

interface SenderResult {
  verified: boolean;
  data: {
    id: string;
    from_email: string;
    from_name: string;
    verified: boolean;
  } | null;
}

interface SendGridListItem {
  id: string;
  name: string;
}

interface EnsureStoreDefaultListInput {
  credentials: SendGridCredentials;
  storeDocumentId: string;
  listNameSuffix?: string;
  existingListId?: string;
}

interface EnsureStoreDefaultListResult {
  success: boolean;
  created: boolean;
  listId: string | null;
  listName: string | null;
  message: string;
  error?: string;
}

interface UpsertContactToListInput {
  credentials: SendGridCredentials;
  listId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, string>;
  tags?: string[];
}

interface UpsertContactToListResult {
  success: boolean;
  message: string;
  jobId: string | null;
  email: string;
  listId: string;
  contactId: string | null;
  error?: string;
}

interface SendWelcomeEmailInput {
  credentials: SendGridCredentials;
  toEmail: string;
  subject: string;
  htmlContent: string;
  fromEmail?: string;
  fromName?: string;
  replyToEmail?: string;
}

interface SendWelcomeEmailResult {
  success: boolean;
  message: string;
  toEmail: string;
  error?: string;
}

/**
 * Test SendGrid Marketing Campaigns API connection and scopes
 */
export async function testSendGridConnection(
  credentials: SendGridCredentials,
  config: SendGridConfig
): Promise<SendGridTestResult> {
  try {
    console.log('[SENDGRID_TEST] Starting connection test');

    const apiKey = credentials.use_default
      ? process.env.SENDGRID_API_KEY
      : credentials.api_key;

    const keySource = credentials.use_default
      ? 'env:SENDGRID_API_KEY'
      : 'extension.credentials.api_key';

    const keyFingerprint = apiKey
      ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)} (len:${apiKey.length})`
      : 'missing';

    if (!apiKey) {
      return {
        success: false,
        status: 'missing_scopes',
        message: 'No API key configured',
        error: 'API key is required',
        next_steps: [
          'Add SendGrid API key to extension credentials',
          'Or set use_default: true to use platform key'
        ]
      };
    }

    const profileResult = await testUserProfile(apiKey);
    if (!profileResult.success) {
      return profileResult as SendGridTestResult;
    }

    const userProfile = profileResult.data as UserProfile;
    const listsResult = await testMarketingLists(apiKey);
    const contactsResult = await testContactsAPI(apiKey);
    const scopesResult = await testScopesAPI(apiKey);
    const senderResult = config.sender_id
      ? await testVerifiedSender(apiKey, config.sender_id)
      : { verified: false, data: null };

    const hasMailSendScope = scopesResult.scopes.includes('mail.send');

    const recommendations: string[] = [];
    const missingScopes: string[] = [];

    if (!listsResult.success) {
      missingScopes.push('Marketing - Lists & Segments: Full Access');
      recommendations.push('Enable "Marketing - Lists & Segments: Full Access" scope');
    }

    if (!contactsResult.success) {
      missingScopes.push('Marketing - Contacts: Full Access');
      recommendations.push('Enable "Marketing - Contacts: Full Access" scope');
    }

    if (!hasMailSendScope) {
      missingScopes.push('Mail Send: Full Access');
      recommendations.push('Enable "Mail Send" scope for welcome emails (v3/mail/send)');
    }

    if (!config.sender_id) {
      recommendations.push('Add a verified sender ID to extension config');
      recommendations.push('Create verified sender in SendGrid → Settings → Sender Authentication');
    } else if (senderResult.data && !senderResult.verified) {
      recommendations.push('Complete email verification for configured sender');
      recommendations.push(`Verify sender email: ${senderResult.data.from_email}`);
    }

    if (!config.default_list_id) {
      recommendations.push('Create a default mailing list in SendGrid');
      recommendations.push('Add list ID to extension config: default_list_id');
    }

    const allScopesPresent = listsResult.success && contactsResult.success;
    const status = allScopesPresent
      ? (recommendations.length === 0 ? 'ready' : 'ready_with_warnings')
      : 'missing_scopes';

    console.log('[SENDGRID_TEST] Test complete:', {
      status,
      scopesOk: allScopesPresent,
      hasRecommendations: recommendations.length > 0
    });

    return {
      success: allScopesPresent,
      status,
      message: allScopesPresent
        ? 'SendGrid connection successful'
        : 'SendGrid connected but missing required scopes',
      data: {
        account: {
          username: userProfile.username,
          email: userProfile.email,
          company: userProfile.company || null
        },
        scopes_detected: {
          marketing_lists: listsResult.success,
          marketing_contacts: contactsResult.success,
          verified_senders: !!senderResult.data || !!config.sender_id,
          mail_send: hasMailSendScope
        },
        capabilities: {
          can_create_lists: listsResult.success,
          can_manage_contacts: contactsResult.success,
          can_send_campaigns: listsResult.success && contactsResult.success,
          has_verified_sender: senderResult.verified,
          can_send_welcome_email: hasMailSendScope
        },
        stats: {
          total_contacts: contactsResult.count,
          lists_count: listsResult.count,
          sender_verified: senderResult.verified
        },
        configured_sender: senderResult.data,
        missing_scopes: missingScopes,
        recommendations,
        debug_scopes: {
          endpoint_accessible: scopesResult.success,
          has_mail_send_scope: hasMailSendScope,
          scopes_count: scopesResult.scopes.length,
          sample: scopesResult.scopes.slice(0, 20)
        },
        debug_auth: {
          key_source: keySource,
          key_fingerprint: keyFingerprint
        },
        pricing_info: {
          note: 'Marketing Campaigns',
          plans: {
            basic: 'tba',
            advanced_10k: 'tba',
            advanced_100k: 'tba'
          },
          monitoring: 'Upgrade when approaching contact limit to avoid restrictions'
        }
      }
    };

  } catch (error: any) {
    console.error('[SENDGRID_TEST] Test failed:', error.message);
    return {
      success: false,
      status: 'missing_scopes',
      message: 'Failed to connect to SendGrid',
      error: error.message,
      next_steps: [
        'Verify SendGrid API key is correct',
        'Check network connectivity',
        'Ensure API key has Marketing Campaigns scopes enabled'
      ]
    };
  }
}

/**
 * Test 1: User Profile - Verify API key authentication
 */
async function testUserProfile(apiKey: string): Promise<SendGridTestResult | { success: true; data: UserProfile }> {
  const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SENDGRID_TEST] Profile fetch failed:', errorText);
    return {
      success: false,
      status: 'missing_scopes',
      message: 'Invalid SendGrid API key',
      error: `Authentication failed (HTTP ${response.status})`,
      details: errorText,
      next_steps: [
        'Verify API key is correct',
        'Check API key has not expired',
        'Regenerate API key in SendGrid dashboard if needed'
      ]
    };
  }

  const userProfile = await response.json() as UserProfile;
  console.log('[SENDGRID_TEST] Profile retrieved:', {
    username: userProfile.username,
    email: userProfile.email
  });

  return { success: true, data: userProfile };
}

/**
 * Test 2: Marketing Lists - Verify list management access
 */
async function testMarketingLists(apiKey: string): Promise<ListsResult> {
  const response = await fetch('https://api.sendgrid.com/v3/marketing/lists?page_size=1', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn('[SENDGRID_TEST] Marketing lists not accessible:', errorText);
    return { success: false, count: 0 };
  }

  const lists = await response.json() as { result: []};
  console.log('[SENDGRID_TEST] Marketing lists accessible:', {
    count: lists?.result?.length || 0
  });

  return { success: true, count: lists?.result?.length || 0 };
}

/**
 * Test 3: Contacts API - Verify contact management access
 */
async function testContactsAPI(apiKey: string): Promise<ContactsResult> {
  const response = await fetch('https://api.sendgrid.com/v3/marketing/contacts/count', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    return { success: false, count: null };
  }

  const contactData = await response.json() as { contact_count: number };
  const count = contactData.contact_count || 0;
  console.log('[SENDGRID_TEST] Contacts accessible:', { count });

  return { success: true, count };
}

/**
 * Test 4: Scopes API - Verify exact permissions on current API key
 */
async function testScopesAPI(apiKey: string): Promise<ScopesResult> {
  const response = await fetch('https://api.sendgrid.com/v3/scopes', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn('[SENDGRID_TEST] Scopes endpoint not accessible:', errorText);
    return { success: false, scopes: [] };
  }

  const data = await response.json() as { scopes?: string[] };
  const scopes = Array.isArray(data?.scopes) ? data.scopes : [];

  console.log('[SENDGRID_TEST] Scopes fetched', {
    count: scopes.length,
    hasMailSend: scopes.includes('mail.send')
  });

  return {
    success: true,
    scopes
  };
}

/**
 * Test 5: Verified Sender - Check sender verification status
 */
async function testVerifiedSender(apiKey: string, senderId: string): Promise<SenderResult> {
  try {
    console.log('[SENDGRID_TEST] Fetching sender verification for ID:', senderId);

    let response = await fetch(
      `https://api.sendgrid.com/v3/verified_senders/${senderId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.log('[SENDGRID_TEST] Trying alternate endpoint /senders');
      response = await fetch(
        `https://api.sendgrid.com/v3/senders/${senderId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[SENDGRID_TEST] Sender verification failed on both endpoints:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        senderId
      });

      return {
        verified: false,
        data: {
          id: senderId,
          from_email: 'Unable to verify (check SendGrid dashboard)',
          from_name: 'Unknown',
          verified: false
        }
      };
    }

    const sender = await response.json() as any;

    // Handle different response structures
    let isVerified = false;
    let fromEmail = 'Unknown';
    let fromName = 'Unknown';

    // Try verified_senders format (id, from_email, from_name, verified)
    if (typeof sender.verified === 'boolean') {
      isVerified = sender.verified;
      fromEmail = sender.from_email || sender.email || 'Unknown';
      fromName = sender.from_name || sender.nickname || 'Unknown';
    }
    // Try /senders format (nested verified object)
    else if (sender.verified && typeof sender.verified.status === 'boolean') {
      isVerified = sender.verified.status;
      fromEmail = sender.from?.email || sender.email || 'Unknown';
      fromName = sender.nickname || sender.from?.name || 'Unknown';
    }

    const senderData = {
      id: String(sender.id || senderId),
      from_email: fromEmail,
      from_name: fromName,
      verified: isVerified
    };

    console.log('[SENDGRID_TEST] Sender verification retrieved:', {
      id: senderData.id,
      email: senderData.from_email,
      name: senderData.from_name,
      verified: senderData.verified
    });

    return { verified: isVerified, data: senderData };

  } catch (error: any) {
    console.error('[SENDGRID_TEST] Sender verification error:', error.message);
    return {
      verified: false,
      data: {
        id: senderId,
        from_email: 'Error fetching sender',
        from_name: 'Error',
        verified: false
      }
    };
  }
}

function resolveSendGridApiKey(credentials: SendGridCredentials): string | null {
  const apiKey = credentials.use_default
    ? process.env.SENDGRID_API_KEY
    : credentials.api_key;

  return apiKey || null;
}

function buildStoreDefaultListName(storeDocumentId: string, suffix = 'all'): string {
  const safeStoreId = storeDocumentId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 24) || 'all';
  return `store:${safeStoreId}:${safeSuffix}`;
}

async function getSendGridListById(apiKey: string, listId: string): Promise<SendGridListItem | null> {
  const response = await fetch(`https://api.sendgrid.com/v3/marketing/lists/${listId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as SendGridListItem;
  if (!data?.id || !data?.name) {
    return null;
  }

  return { id: data.id, name: data.name };
}

async function findSendGridListByName(apiKey: string, targetName: string): Promise<SendGridListItem | null> {
  const response = await fetch('https://api.sendgrid.com/v3/marketing/lists?page_size=200', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as { result?: SendGridListItem[] };
  const list = data?.result?.find((item) => item?.name === targetName);

  if (!list?.id || !list?.name) {
    return null;
  }

  return { id: list.id, name: list.name };
}

async function createSendGridList(apiKey: string, listName: string): Promise<SendGridListItem | null> {
  const response = await fetch('https://api.sendgrid.com/v3/marketing/lists', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: listName })
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as SendGridListItem;
  if (!data?.id || !data?.name) {
    return null;
  }

  return { id: data.id, name: data.name };
}

async function findSendGridContactIdByEmail(apiKey: string, email: string): Promise<string | null> {
  const response = await fetch('https://api.sendgrid.com/v3/marketing/contacts/search/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ emails: [email] })
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as {
    result?: {
      [email: string]: {
        id?: string;
      }
    }
  };

  const contactId = data?.result?.[email]?.id;
  return contactId || null;
}

export async function ensureStoreDefaultSendGridList(
  input: EnsureStoreDefaultListInput
): Promise<EnsureStoreDefaultListResult> {
  const { credentials, storeDocumentId, listNameSuffix = 'all', existingListId } = input;

  if (!storeDocumentId) {
    return {
      success: false,
      created: false,
      listId: null,
      listName: null,
      message: 'Missing required storeDocumentId',
      error: 'storeDocumentId is required'
    };
  }

  const apiKey = resolveSendGridApiKey(credentials);
  if (!apiKey) {
    return {
      success: false,
      created: false,
      listId: null,
      listName: null,
      message: 'No SendGrid API key configured',
      error: 'Missing API key'
    };
  }

  const targetListName = buildStoreDefaultListName(storeDocumentId, listNameSuffix);

  try {
    if (existingListId) {
      const existingById = await getSendGridListById(apiKey, existingListId);
      if (existingById) {
        console.log('[SENDGRID_SYNC] Reusing configured list by id', {
          storeDocumentId,
          listId: existingById.id
        });

        return {
          success: true,
          created: false,
          listId: existingById.id,
          listName: existingById.name,
          message: 'Existing list found by ID'
        };
      }
    }

    const existingByName = await findSendGridListByName(apiKey, targetListName);
    if (existingByName) {
      console.log('[SENDGRID_SYNC] Reusing existing store default list', {
        storeDocumentId,
        listId: existingByName.id,
        listName: existingByName.name
      });

      return {
        success: true,
        created: false,
        listId: existingByName.id,
        listName: existingByName.name,
        message: 'Existing list found by name'
      };
    }

    const created = await createSendGridList(apiKey, targetListName);
    if (!created) {
      return {
        success: false,
        created: false,
        listId: null,
        listName: null,
        message: 'Failed to create store default list',
        error: 'SendGrid list creation failed'
      };
    }

    console.log('[SENDGRID_SYNC] Created store default list', {
      storeDocumentId,
      listId: created.id,
      listName: created.name
    });

    return {
      success: true,
      created: true,
      listId: created.id,
      listName: created.name,
      message: 'Store default list created'
    };
  } catch (error: any) {
    console.error('[SENDGRID_SYNC] ensureStoreDefaultSendGridList failed:', error.message);
    return {
      success: false,
      created: false,
      listId: null,
      listName: null,
      message: 'Failed to ensure store default list',
      error: error.message
    };
  }
}

export async function upsertContactToList(
  input: UpsertContactToListInput
): Promise<UpsertContactToListResult> {
  const {
    credentials,
    listId,
    email,
    firstName,
    lastName,
    customFields,
    tags
  } = input;

  if (!listId || !email) {
    return {
      success: false,
      message: 'Missing required fields for contact upsert',
      jobId: null,
      email,
      listId,
      contactId: null,
      error: 'listId and email are required'
    };
  }

  const apiKey = resolveSendGridApiKey(credentials);
  if (!apiKey) {
    return {
      success: false,
      message: 'No SendGrid API key configured',
      jobId: null,
      email,
      listId,
      contactId: null,
      error: 'Missing API key'
    };
  }

  try {
    const payload: {
      list_ids: string[];
      contacts: Array<{
        email: string;
        first_name?: string;
        last_name?: string;
        custom_fields?: Record<string, string>;
      }>;
    } = {
      list_ids: [listId],
      contacts: [
        {
          email,
          ...(firstName ? { first_name: firstName } : {}),
          ...(lastName ? { last_name: lastName } : {}),
          ...(customFields && Object.keys(customFields).length > 0 ? { custom_fields: customFields } : {})
        }
      ]
    };

    const response = await fetch('https://api.sendgrid.com/v3/marketing/contacts', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SENDGRID_SYNC] Contact upsert failed:', {
        email,
        listId,
        status: response.status,
        error: errorText
      });

      return {
        success: false,
        message: 'Failed to upsert contact to list',
        jobId: null,
        email,
        listId,
        contactId: null,
        error: errorText
      };
    }

    const upsertResult = await response.json() as { job_id?: string };
    const contactId = await findSendGridContactIdByEmail(apiKey, email);

    console.log('[SENDGRID_SYNC] Contact upsert accepted', {
      email,
      listId,
      hasJobId: !!upsertResult?.job_id,
      hasContactId: !!contactId
    });

    // TODO(newsletter-phase-2): Manage segmentation tags in SendGrid for interest-based targeting.
    // TODO(newsletter-phase-2): Map platform-level subscription preferences to SendGrid custom fields.
    void tags;

    return {
      success: true,
      message: 'Contact upsert accepted by SendGrid',
      jobId: upsertResult?.job_id || null,
      email,
      listId,
      contactId
    };
  } catch (error: any) {
    console.error('[SENDGRID_SYNC] upsertContactToList failed:', error.message);
    return {
      success: false,
      message: 'Contact upsert failed unexpectedly',
      jobId: null,
      email,
      listId,
      contactId: null,
      error: error.message
    };
  }
}

export async function sendWelcomeEmail(input: SendWelcomeEmailInput): Promise<SendWelcomeEmailResult> {
  const {
    credentials,
    toEmail,
    subject,
    htmlContent,
    fromEmail,
    fromName,
    replyToEmail,
  } = input;

  if (!toEmail || !subject || !htmlContent) {
    return {
      success: false,
      message: 'Missing required welcome email fields',
      toEmail,
      error: 'toEmail, subject, and htmlContent are required'
    };
  }

  const apiKey = resolveSendGridApiKey(credentials);
  if (!apiKey) {
    return {
      success: false,
      message: 'No SendGrid API key configured',
      toEmail,
      error: 'Missing API key'
    };
  }

  const resolvedFromEmail = fromEmail || process.env.SENDGRID_FROM_EMAIL || 'support@markket.place';
  const resolvedFromName = fromName || 'Markkët';

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: toEmail }],
            subject
          }
        ],
        from: {
          email: resolvedFromEmail,
          name: resolvedFromName
        },
        ...(replyToEmail ? { reply_to: { email: replyToEmail } } : {}),
        content: [
          {
            type: 'text/html',
            value: htmlContent
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[SENDGRID_SYNC] Welcome email failed:', {
        toEmail,
        status: response.status,
        error: errorText
      });

      return {
        success: false,
        message: 'Welcome email request failed',
        toEmail,
        error: errorText
      };
    }

    console.log('[SENDGRID_SYNC] Welcome email sent', { toEmail });

    return {
      success: true,
      message: 'Welcome email sent',
      toEmail
    };
  } catch (error: any) {
    console.warn('[SENDGRID_SYNC] Welcome email exception:', error.message);
    return {
      success: false,
      message: 'Welcome email request failed unexpectedly',
      toEmail,
      error: error.message
    };
  }
}
