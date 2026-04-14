/**
 * CRM orchestration + third-party placeholders
 * Keep third-party calls centralized so controllers remain thin.
 */

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

export async function placeholderCreateStripeConnectOnboardingLink(input: {
  storeDocumentId: string;
  refreshUrl?: string;
  returnUrl?: string;
}): Promise<PlaceholderResponse> {
  return {
    ok: false,
    action: 'stripe.connect.onboarding_link.create',
    status: 'placeholder',
    reason: 'Stripe Connect onboarding link generation is not wired yet in this phase.',
    required: INTEGRATION_REQUIREMENTS.stripeConnect,
    payload: input,
  };
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
