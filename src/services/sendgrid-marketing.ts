/**
 * SendGrid Marketing Campaigns API Test Service
 * Tests API key scopes and connection
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
    };
    capabilities: {
      can_create_lists: boolean;
      can_manage_contacts: boolean;
      can_send_campaigns: boolean;
      has_verified_sender: boolean;
    };
    stats: {
      total_contacts: number | null;
      lists_count: number;
      sender_verified: boolean;
    };
    configured_sender: any;
    missing_scopes: string[];
    recommendations: string[];
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

interface SenderResult {
  verified: boolean;
  data: {
    id: string;
    from_email: string;
    from_name: string;
    verified: boolean;
  } | null;
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
    const senderResult = config.sender_id
      ? await testVerifiedSender(apiKey, config.sender_id)
      : { verified: false, data: null };

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
          verified_senders: !!senderResult.data || !!config.sender_id
        },
        capabilities: {
          can_create_lists: listsResult.success,
          can_manage_contacts: contactsResult.success,
          can_send_campaigns: listsResult.success && contactsResult.success,
          has_verified_sender: senderResult.verified
        },
        stats: {
          total_contacts: contactsResult.count,
          lists_count: listsResult.count,
          sender_verified: senderResult.verified
        },
        configured_sender: senderResult.data,
        missing_scopes: missingScopes,
        recommendations,
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
 * Test 4: Verified Sender - Check sender verification status
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
