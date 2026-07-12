/**
 * CRM orchestration + third-party placeholders
 * Keep third-party calls centralized so controllers remain thin.
 */

import type { Stripe as StripeClient } from 'stripe';
import { getStripeClient } from '../../../services/stripe';

export type PlaceholderResponse = {
  ok: boolean;
  action: string;
  status: 'placeholder';
  reason: string;
  required: {
    sdk: string;
    env: string[];
    api?: string;
    notes?: string;
  };
  payload?: Record<string, any>;
};

type StripeConnectLinkType = 'account_onboarding' | 'account_update';

type StripeConnectStatusPayload = {
  account_id: string | null;
  onboarding_completed: boolean;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
  requirements_past_due: string[];
  disabled_reason: string | null;
  status: 'not_connected' | 'pending' | 'restricted' | 'active';
  source: 'live_stripe' | 'store.settings.meta' | 'placeholder';
  last_synced_at: string | null;
};

type StripeConnectStatusResult = {
  ok: boolean;
  data: StripeConnectStatusPayload;
  reason?: string;
};

const DEFAULT_CONNECT_DASHBOARD_URL = 'https://markket.place/dashboard/crm';

const INTEGRATION_REQUIREMENTS = {
  stripeConnect: {
    sdk: 'stripe',
    api: 'https://docs.stripe.com/connect',
    env: ['STRIPE_SECRET_KEY'],
    notes: 'Use Account Links for onboarding and account sessions for dashboard access.',
  },
  sendgridMarketing: {
    sdk: '@sendgrid/client',
    api: 'https://docs.sendgrid.com/api-reference',
    env: ['SENDGRID_API_KEY'],
    notes: 'Use Marketing Contacts + Single Sends APIs.',
  },
  sendgridMail: {
    sdk: '@sendgrid/mail',
    api: 'https://docs.sendgrid.com/for-developers/sending-email/quickstart-nodejs',
    env: ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'],
    notes: 'Transactional fallback for targeted sends.',
  },
  customerData: {
    sdk: 'none',
    env: [],
    notes: 'Computed from order + subscriber data in Strapi.',
  },
};

export function getIntegrationPlan() {
  return INTEGRATION_REQUIREMENTS;
}

function pickStripeClient(stripeTest?: boolean): StripeClient | null {
  return getStripeClient(Boolean(stripeTest));
}

function isNonEmptyString(value: any): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function toAbsoluteUrl(value: string): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const raw = value.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    return new URL(withProtocol).toString();
  } catch (_error) {
    return null;
  }
}

function appendQueryParam(input: string, key: string, value: string): string {
  const url = new URL(input);
  url.searchParams.set(key, value);
  return url.toString();
}

function buildDefaultStripeUrls(store: any): { refreshUrl: string; returnUrl: string; dashboardUrl: string } {
  const dashboardFromSettings = toAbsoluteUrl(store?.settings?.dashboard_url || '');
  const domainFromSettings = toAbsoluteUrl(store?.settings?.domain || '');

  let dashboardUrl = dashboardFromSettings;
  if (!dashboardUrl && domainFromSettings) {
    dashboardUrl = new URL('/dashboard/crm', domainFromSettings).toString();
  }
  if (!dashboardUrl) {
    dashboardUrl = DEFAULT_CONNECT_DASHBOARD_URL;
  }

  dashboardUrl = appendQueryParam(dashboardUrl, 'store', String(store.documentId || ''));

  return {
    dashboardUrl,
    refreshUrl: appendQueryParam(dashboardUrl, 'stripe_connect', 'refresh'),
    returnUrl: appendQueryParam(dashboardUrl, 'stripe_connect', 'return'),
  };
}

async function getStoreByDocumentId(storeDocumentId: string): Promise<any | null> {
  const normalized = String(storeDocumentId || '').trim();
  if (!normalized) {
    return null;
  }

  return (strapi.documents as any)('api::store.store').findOne({
    documentId: normalized,
    populate: ['settings', 'owner'],
  }) as Promise<any | null>;
}

async function persistStoreSettingMeta(store: any, metaPatch: Record<string, any>): Promise<any | null> {
  const nextMeta = {
    ...(store?.settings?.meta || {}),
    ...metaPatch,
  };

  if (store?.settings?.documentId) {
    return (strapi.documents as any)('api::store.store-setting').update({
      documentId: store.settings.documentId,
      data: { meta: nextMeta },
    });
  }

  return (strapi.documents as any)('api::store.store-setting').create({
    data: {
      store: store.documentId,
      meta: nextMeta,
    },
  });
}

async function persistStripeAccountReference(store: any, accountId: string): Promise<void> {
  if (!isNonEmptyString(accountId)) {
    return;
  }

  if (store?.STRIPE_CUSTOMER_ID !== accountId) {
    await (strapi.documents as any)('api::store.store').update({
      documentId: store.documentId,
      data: { STRIPE_CUSTOMER_ID: accountId },
    });
  }

  await persistStoreSettingMeta(store, {
    stripe_connect_account_id: accountId,
  });
}

function classifyStripeStatus(payload: {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
  requirementsPastDue: string[];
  disabledReason: string | null;
}): StripeConnectStatusPayload['status'] {
  if (!payload.accountId) {
    return 'not_connected';
  }

  if (payload.chargesEnabled && payload.payoutsEnabled) {
    return 'active';
  }

  if (payload.disabledReason || payload.requirementsPastDue.length > 0) {
    return 'restricted';
  }

  if (payload.requirementsDue.length > 0) {
    return 'pending';
  }

  return 'pending';
}

function getStoredStripeConnectStatus(store: any): StripeConnectStatusPayload {
  const meta = store?.settings?.meta || {};

  const accountId = isNonEmptyString(store?.STRIPE_CUSTOMER_ID)
    ? store.STRIPE_CUSTOMER_ID
    : isNonEmptyString(meta?.stripe_connect_account_id)
      ? meta.stripe_connect_account_id
      : null;

  const requirementsDue = Array.isArray(meta?.stripe_connect_requirements_due)
    ? meta.stripe_connect_requirements_due.filter((entry: any) => isNonEmptyString(entry)).map((entry: string) => entry.trim())
    : [];

  const requirementsPastDue = Array.isArray(meta?.stripe_connect_requirements_past_due)
    ? meta.stripe_connect_requirements_past_due.filter((entry: any) => isNonEmptyString(entry)).map((entry: string) => entry.trim())
    : [];

  const disabledReason = isNonEmptyString(meta?.stripe_connect_disabled_reason)
    ? meta.stripe_connect_disabled_reason.trim()
    : null;

  const chargesEnabled = !!meta?.stripe_connect_charges_enabled;
  const payoutsEnabled = !!meta?.stripe_connect_payouts_enabled;

  return {
    account_id: accountId,
    onboarding_completed: !!meta?.stripe_connect_onboarding_completed,
    details_submitted: !!meta?.stripe_connect_details_submitted,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    requirements_due: requirementsDue,
    requirements_past_due: requirementsPastDue,
    disabled_reason: disabledReason,
    status: classifyStripeStatus({
      accountId,
      chargesEnabled,
      payoutsEnabled,
      requirementsDue,
      requirementsPastDue,
      disabledReason,
    }),
    source: accountId ? 'store.settings.meta' : 'placeholder',
    last_synced_at: isNonEmptyString(meta?.stripe_connect_last_synced_at)
      ? meta.stripe_connect_last_synced_at
      : null,
  };
}

async function ensureConnectedAccount(input: {
  store: any;
  stripe: StripeClient;
  country?: string;
}): Promise<{ accountId: string; created: boolean }> {
  const { store, stripe } = input;

  if (isNonEmptyString(store?.STRIPE_CUSTOMER_ID)) {
    return {
      accountId: store.STRIPE_CUSTOMER_ID,
      created: false,
    };
  }

  const country = isNonEmptyString(input.country) ? input.country.trim().toUpperCase() : 'US';

  const account = await stripe.accounts.create({
    type: 'express',
    country,
    email: isNonEmptyString(store?.owner?.email) ? store.owner.email.trim() : undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      store_document_id: String(store.documentId || ''),
      store_slug: String(store.slug || ''),
    },
  });

  await persistStripeAccountReference(store, account.id);

  return {
    accountId: account.id,
    created: true,
  };
}

export async function syncStripeConnectStatus(input: {
  storeDocumentId: string;
  stripeTest?: boolean;
}): Promise<StripeConnectStatusResult> {
  const store = await getStoreByDocumentId(input.storeDocumentId);
  if (!store) {
    return {
      ok: false,
      data: {
        account_id: null,
        onboarding_completed: false,
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
        requirements_due: [],
        requirements_past_due: [],
        disabled_reason: null,
        status: 'not_connected',
        source: 'placeholder',
        last_synced_at: null,
      },
      reason: 'Store not found',
    };
  }

  const accountId = isNonEmptyString(store.STRIPE_CUSTOMER_ID)
    ? store.STRIPE_CUSTOMER_ID
    : null;

  if (!accountId) {
    return {
      ok: true,
      data: getStoredStripeConnectStatus(store),
    };
  }

  const stripe = pickStripeClient(input.stripeTest);
  if (!stripe) {
    return {
      ok: true,
      data: getStoredStripeConnectStatus(store),
      reason: 'Stripe client not configured; falling back to stored status',
    };
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const requirementsDue = Array.isArray(account?.requirements?.currently_due)
      ? account.requirements.currently_due
      : [];
    const requirementsPastDue = Array.isArray(account?.requirements?.past_due)
      ? account.requirements.past_due
      : [];
    const disabledReason = isNonEmptyString(account?.requirements?.disabled_reason)
      ? account.requirements.disabled_reason
      : null;

    const lastSyncedAt = new Date().toISOString();
    const chargesEnabled = !!account?.charges_enabled;
    const payoutsEnabled = !!account?.payouts_enabled;
    const detailsSubmitted = !!account?.details_submitted;
    const onboardingCompleted = detailsSubmitted && chargesEnabled && payoutsEnabled;

    const status = classifyStripeStatus({
      accountId,
      chargesEnabled,
      payoutsEnabled,
      requirementsDue,
      requirementsPastDue,
      disabledReason,
    });

    await persistStoreSettingMeta(store, {
      stripe_connect_account_id: accountId,
      stripe_connect_onboarding_completed: onboardingCompleted,
      stripe_connect_details_submitted: detailsSubmitted,
      stripe_connect_charges_enabled: chargesEnabled,
      stripe_connect_payouts_enabled: payoutsEnabled,
      stripe_connect_requirements_due: requirementsDue,
      stripe_connect_requirements_past_due: requirementsPastDue,
      stripe_connect_disabled_reason: disabledReason,
      stripe_connect_last_synced_at: lastSyncedAt,
    });

    return {
      ok: true,
      data: {
        account_id: accountId,
        onboarding_completed: onboardingCompleted,
        details_submitted: detailsSubmitted,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        requirements_due: requirementsDue,
        requirements_past_due: requirementsPastDue,
        disabled_reason: disabledReason,
        status,
        source: 'live_stripe',
        last_synced_at: lastSyncedAt,
      },
    };
  } catch (error: any) {
    return {
      ok: true,
      data: getStoredStripeConnectStatus(store),
      reason: error?.message || 'Stripe account fetch failed; falling back to stored status',
    };
  }
}

export async function createStripeConnectLink(input: {
  storeDocumentId: string;
  refreshUrl?: string;
  returnUrl?: string;
  stripeTest?: boolean;
  country?: string;
  linkType: StripeConnectLinkType;
}): Promise<Record<string, any>> {
  const store = await getStoreByDocumentId(input.storeDocumentId);
  if (!store) {
    return {
      ok: false,
      action: 'stripe.connect.link.create',
      reason: 'Store not found',
      required: INTEGRATION_REQUIREMENTS.stripeConnect,
    };
  }

  const stripe = pickStripeClient(input.stripeTest);
  if (!stripe) {
    return {
      ok: false,
      action: 'stripe.connect.link.create',
      reason: 'Stripe client is not configured',
      required: INTEGRATION_REQUIREMENTS.stripeConnect,
    };
  }

  const defaults = buildDefaultStripeUrls(store);
  const refreshUrl = toAbsoluteUrl(input.refreshUrl || '') || defaults.refreshUrl;
  const returnUrl = toAbsoluteUrl(input.returnUrl || '') || defaults.returnUrl;

  const account = await ensureConnectedAccount({
    store,
    stripe,
    country: input.country,
  });

  const link = await stripe.accountLinks.create({
    account: account.accountId,
    type: input.linkType,
    refresh_url: refreshUrl,
    return_url: returnUrl,
  });

  const status = await syncStripeConnectStatus({
    storeDocumentId: store.documentId,
    stripeTest: input.stripeTest,
  });

  return {
    ok: true,
    action: input.linkType === 'account_update'
      ? 'stripe.connect.review_link.create'
      : 'stripe.connect.onboarding_link.create',
    data: {
      account_id: account.accountId,
      created_account: account.created,
      link_type: input.linkType,
      url: link.url,
      expires_at: link.expires_at,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      dashboard_url: defaults.dashboardUrl,
      status: status.data,
    },
    integrations: {
      required: INTEGRATION_REQUIREMENTS.stripeConnect,
    },
  };
}

export async function createStripeConnectDashboardLink(input: {
  storeDocumentId: string;
  returnUrl?: string;
  stripeTest?: boolean;
}): Promise<Record<string, any>> {
  const store = await getStoreByDocumentId(input.storeDocumentId);
  if (!store) {
    return {
      ok: false,
      action: 'stripe.connect.dashboard_link.create',
      reason: 'Store not found',
      required: INTEGRATION_REQUIREMENTS.stripeConnect,
    };
  }

  if (!isNonEmptyString(store.STRIPE_CUSTOMER_ID)) {
    return {
      ok: false,
      action: 'stripe.connect.dashboard_link.create',
      reason: 'Store does not have a connected Stripe account yet',
      required: INTEGRATION_REQUIREMENTS.stripeConnect,
    };
  }

  const stripe = pickStripeClient(input.stripeTest);
  if (!stripe) {
    return {
      ok: false,
      action: 'stripe.connect.dashboard_link.create',
      reason: 'Stripe client is not configured',
      required: INTEGRATION_REQUIREMENTS.stripeConnect,
    };
  }

  const defaults = buildDefaultStripeUrls(store);
  const redirectUrl = toAbsoluteUrl(input.returnUrl || '') || defaults.dashboardUrl;

  try {
    const loginLink = await stripe.accounts.createLoginLink(store.STRIPE_CUSTOMER_ID);

    return {
      ok: true,
      action: 'stripe.connect.dashboard_link.create',
      data: {
        account_id: store.STRIPE_CUSTOMER_ID,
        url: loginLink.url,
        created: Date.now(),
        redirect_url: redirectUrl,
      },
      integrations: {
        required: INTEGRATION_REQUIREMENTS.stripeConnect,
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      action: 'stripe.connect.dashboard_link.create',
      reason: error?.message || 'Failed to create Stripe dashboard login link',
      required: INTEGRATION_REQUIREMENTS.stripeConnect,
    };
  }
}

export async function placeholderCreateStripeConnectOnboardingLink(input: {
  storeDocumentId: string;
  refreshUrl?: string;
  returnUrl?: string;
}): Promise<PlaceholderResponse> {
  return createStripeConnectLink({
    ...input,
    linkType: 'account_onboarding',
  }) as unknown as PlaceholderResponse;
}

export async function placeholderSyncSubscriber(input: {
  storeDocumentId: string;
  subscriberDocumentId: string;
}): Promise<PlaceholderResponse> {
  return {
    ok: false,
    action: 'sendgrid.subscriber.sync',
    status: 'placeholder',
    reason: 'Subscriber sync endpoint exists but third-party sync orchestration is deferred to phase 2 implementation.',
    required: INTEGRATION_REQUIREMENTS.sendgridMarketing,
    payload: input,
  };
}

export async function placeholderSendNewsletter(input: {
  storeDocumentId: string;
  newsletterDocumentId: string;
  mode?: 'single_send' | 'transactional';
}): Promise<PlaceholderResponse> {
  return {
    ok: false,
    action: 'sendgrid.newsletter.send',
    status: 'placeholder',
    reason: 'Newsletter send endpoint exists but third-party send execution is deferred to phase 2 implementation.',
    required: INTEGRATION_REQUIREMENTS.sendgridMarketing,
    payload: input,
  };
}
