import { emailLayout } from '../api/markket/services/notification/email.template';

interface BuildWelcomeEmailHtmlInput {
  storeName?: string;
  storeDomain?: string;
  storeLogoUrl?: string;
  welcomeMessage?: string;
  supportEmail?: string;
  unsubscribeUrl?: string;
}

interface BuildStoreOwnerCongratsEmailHtmlInput {
  ownerName?: string;
  storeName: string;
  storeSlug?: string;
  isFirstStore?: boolean;
  introLine?: string;
  adviceLine?: string;
}

const EMAIL_DEFAULTS = {
  APP_URL: 'https://markket.place',
  SUPPORT_EMAIL: 'support@markket.place',
  FONT_STACK: 'Arial,Helvetica,sans-serif',
};

const EMAIL_COLORS = {
  WHITE: '#ffffff',
  SKY_500: '#0ea5e9',
  SLATE_900: '#0f172a',
  SLATE_700: '#334155',
  SLATE_200: '#cbd5e1',
  SLATE_100: '#f1f5f9',
  GREEN_50: '#f0fdf4',
  GREEN_200: '#bbf7d0',
  GREEN_900: '#14532d',
  ROSE_600: '#e11d48',
};

interface ChipStyle {
  background: string;
  border: string;
  color: string;
}

interface Chip {
  label: string;
  style: ChipStyle;
}

const CHIP_STYLES = {
  SKY: { background: '#e0f2fe', border: '#bae6fd', color: '#0c4a6e' },
  CYAN: { background: '#ecfeff', border: '#a5f3fc', color: '#155e75' },
  BLUE: { background: '#f0f9ff', border: '#bfdbfe', color: '#1e3a8a' },
  GREEN: { background: '#dcfce7', border: '#bbf7d0', color: '#166534' },
  TEAL: { background: '#ecfeff', border: '#a5f3fc', color: '#0e7490' },
  INDIGO: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
};

const WELCOME_CHIPS: Chip[] = [
  { label: 'Fresh drops', style: CHIP_STYLES.SKY },
  { label: 'Store signals', style: CHIP_STYLES.CYAN },
  { label: 'No spam', style: CHIP_STYLES.BLUE },
];

const LAUNCH_CHIPS: Chip[] = [
  { label: 'Launch ready', style: CHIP_STYLES.GREEN },
  { label: 'Publish fast', style: CHIP_STYLES.TEAL },
  { label: 'Grow daily', style: CHIP_STYLES.INDIGO },
];

function escapeHtml(value: string | undefined | null): string {
  const raw = String(value ?? '');
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlWithBreaks(value: string | undefined | null): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br/>');
}

function normalizeUrl(value: string | undefined | null): string {
  const input = String(value || '').trim();
  if (!input) {
    return '';
  }

  try {
    const parsed = new URL(input);
    return parsed.toString();
  } catch {
    return '';
  }
}

function renderChipRow(chips: Chip[]): string {
  const cells = chips
    .map((chip, index) => {
      const rightPadding = index < chips.length - 1 ? 'padding:0 8px 0 0;' : '';
      return `
        <td style="${rightPadding}">
          <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${chip.style.background};border:1px solid ${chip.style.border};font-size:11px;font-weight:700;letter-spacing:.04em;color:${chip.style.color};text-transform:uppercase;">${chip.label}</span>
        </td>
      `;
    })
    .join('');

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:12px 0 0 0;">
      <tr>${cells}</tr>
    </table>
  `;
}

interface CtaButton {
  href: string;
  label: string;
  background: string;
  textColor: string;
  border?: string;
  padding: string;
  fontSize: string;
  fontWeight: string;
}

function renderButtonCell(button: CtaButton): string {
  const borderStyle = button.border ? `;border:1px solid ${button.border}` : '';
  return `
    <td bgcolor="${button.background}" style="border-radius:999px${borderStyle};">
      <a href="${button.href}" style="display:inline-block;padding:${button.padding};font-family:${EMAIL_DEFAULTS.FONT_STACK};font-size:${button.fontSize};font-weight:${button.fontWeight};color:${button.textColor};text-decoration:none;border-radius:999px;">${button.label}</a>
    </td>
  `;
}

function renderDualButtonRow(primary: CtaButton, secondary: CtaButton): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        ${renderButtonCell(primary)}
        <td style="width:10px;">&nbsp;</td>
        ${renderButtonCell(secondary)}
      </tr>
    </table>
  `;
}

export function buildWelcomeEmailHtml(input: BuildWelcomeEmailHtmlInput): string {
  const {
    storeName,
    storeDomain,
    storeLogoUrl,
    welcomeMessage,
    supportEmail = EMAIL_DEFAULTS.SUPPORT_EMAIL,
    unsubscribeUrl,
  } = input;

  const safeStoreName = escapeHtml(storeName || 'Markkët');
  const safeSupportEmail = escapeHtml(supportEmail);
  const safeWelcomeMessage = escapeHtmlWithBreaks(welcomeMessage || '');
  const safeUnsubscribeUrl = normalizeUrl(unsubscribeUrl);
  const safeStoreDomain = normalizeUrl(storeDomain || EMAIL_DEFAULTS.APP_URL) || EMAIL_DEFAULTS.APP_URL;
  const supportMailto = `mailto:${safeSupportEmail}`;

  const defaultWelcomeMessage = safeWelcomeMessage || `Good things are on the way: new drops, stories, and updates picked just for you. Glad you're here (^-^).`;

  const content = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        <td style="padding:0;border-radius:16px;border:1px solid #bfdbfe;background:#ffffff;overflow:hidden;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="height:6px;font-size:0;line-height:0;background:linear-gradient(90deg,#0284c7 0%,#22d3ee 55%,#0ea5e9 100%);">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:20px 22px;color:#0f172a;">
                <p style="margin:0 0 10px 0;font-size:11px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase;font-weight:700;">Newsletter</p>
                <h2 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;color:#0f172a;">Welcome aboard ✦</h2>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#1e293b;">${defaultWelcomeMessage}</p>
                ${renderChipRow(WELCOME_CHIPS)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        <td style="padding:16px 18px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;">
          <p style="margin:0 0 8px 0;font-size:14px;color:#111827;"><strong>What to expect</strong></p>
          <ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.7;">
            <li>Fresh products and curated picks you'll probably love</li>
            <li>Events, launches, and key updates from the store</li>
            <li>Useful stuff only: no spam, no filler</li>
          </ul>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        <td style="padding:16px 18px;border:1px solid #dbeafe;border-radius:14px;background:#eff6ff;">
          <p style="margin:0 0 10px 0;font-size:13px;color:#1e3a8a;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">3 quick moves</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td width="33.3%" style="padding:0 8px 0 0;vertical-align:top;">
                <div style="padding:10px 10px;border-radius:10px;background:#ffffff;border:1px solid #bfdbfe;font-size:13px;line-height:1.5;color:#1e293b;">
                  <strong style="display:block;color:#0f172a;margin-bottom:4px;">Browse</strong>
                  Visit the store and bookmark your favorites.
                </div>
              </td>
              <td width="33.3%" style="padding:0 8px;vertical-align:top;">
                <div style="padding:10px 10px;border-radius:10px;background:#ffffff;border:1px solid #bfdbfe;font-size:13px;line-height:1.5;color:#1e293b;">
                  <strong style="display:block;color:#0f172a;margin-bottom:4px;">Watch</strong>
                  Watch for drops, restocks, and new events.
                </div>
              </td>
              <td width="33.3%" style="padding:0 0 0 8px;vertical-align:top;">
                <div style="padding:10px 10px;border-radius:10px;background:#ffffff;border:1px solid #bfdbfe;font-size:13px;line-height:1.5;color:#1e293b;">
                  <strong style="display:block;color:#0f172a;margin-bottom:4px;">Ask</strong>
                  Reply any time if you need help.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${renderDualButtonRow(
      {
        href: safeStoreDomain,
        label: 'Visit store',
        background: EMAIL_COLORS.SKY_500,
        textColor: EMAIL_COLORS.WHITE,
        padding: '12px 22px',
        fontSize: '14px',
        fontWeight: 'bold',
      },
      {
        href: supportMailto,
        label: 'Ask support',
        background: EMAIL_COLORS.SLATE_100,
        border: EMAIL_COLORS.SLATE_200,
        textColor: EMAIL_COLORS.SLATE_900,
        padding: '11px 20px',
        fontSize: '13px',
        fontWeight: '700',
      }
    )}

    <p style="margin:0 0 14px 0;padding:10px 14px;border-left:3px solid #0ea5e9;background:#f8fafc;border-radius:0 8px 8px 0;font-size:13px;line-height:1.7;color:#475569;">Quick tip: star this email so your subscription settings stay handy.</p>

    ${!storeName ? `<p style="margin:0 0 14px 0;font-size:14px;color:${EMAIL_COLORS.SLATE_700};">Discover independent stores, unique products, and the people behind them.</p>` : ''}
    <p style="margin:0 0 14px 0;font-size:14px;color:${EMAIL_COLORS.SLATE_700};">Need a hand? Reach us at <a href="${supportMailto}" style="color:#0369a1;text-decoration:none;font-weight:600;">${safeSupportEmail}</a>.</p>
    ${safeUnsubscribeUrl ? `
      <p style="margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#475569;">If you ever want to unsubscribe, use the link below.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px 0;">
        <tr>
          ${renderButtonCell({
            href: safeUnsubscribeUrl,
            label: 'Manage subscription',
            background: EMAIL_COLORS.ROSE_600,
            textColor: EMAIL_COLORS.WHITE,
            padding: '11px 18px',
            fontSize: '13px',
            fontWeight: 'bold',
          })}
        </tr>
      </table>
    ` : ''}
  `;

  return emailLayout({
    title: `You're subscribed 🎉`,
    content,
    store: {
      title: safeStoreName,
      slug: 'newsletter',
      documentId: 'newsletter',
      Favicon: {
        url: storeLogoUrl || ''
      },
      settings: {
        email_header_message: `Welcome! You're now subscribed.`,
        store_name_override: safeStoreName,
        welcome_email_text: safeWelcomeMessage,
        dashboard_url: '',
        domain: safeStoreDomain
      }
    }
  });
}

interface BuildInviteEmailHtmlInput {
  storeName: string;
  storeSlug?: string;
  invitedByName?: string;
  magicLinkUrl: string;
  isResend?: boolean;
}

export function buildInviteEmailHtml(input: BuildInviteEmailHtmlInput): string {
  const { storeName, storeSlug, invitedByName, magicLinkUrl, isResend = false } = input;

  const safeStoreName = escapeHtml(storeName);
  const safeStoreSlug = escapeHtml(storeSlug);
  const safeInvitedBy = escapeHtml(invitedByName);
  const safeMagicLink = normalizeUrl(magicLinkUrl);

  const inviteLabel = isResend ? 'Invite refreshed' : 'Editor invite';
  const inviteHeadline = isResend
    ? 'Your refreshed editor invite link is ready'
    : 'You are invited to join as an editor';
  const inviteIntro = isResend
    ? `${safeInvitedBy ? `<strong>${safeInvitedBy}</strong> sent you a fresh invite link.` : 'A fresh invite link is ready for you.'}`
    : `${safeInvitedBy ? `<strong>${safeInvitedBy}</strong> invited you to help manage this store on Markketplace.` : 'You are invited to help manage this store on Markketplace.'}`;

  const content = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        <td style="padding:0;border-radius:16px;border:1px solid #bfdbfe;background:#ffffff;overflow:hidden;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="height:6px;font-size:0;line-height:0;background:linear-gradient(90deg,#6366f1 0%,#0ea5e9 55%,#22d3ee 100%);">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:20px 22px;color:#0f172a;">
                <p style="margin:0 0 10px 0;font-size:11px;color:#4338ca;letter-spacing:.1em;text-transform:uppercase;font-weight:700;">${inviteLabel}</p>
                <h2 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;color:#0f172a;">${inviteHeadline}</h2>
                <p style="margin:0 0 10px 0;font-size:15px;line-height:1.7;color:#1e293b;">${inviteIntro}</p>
                <p style="margin:0;display:inline-block;padding:6px 12px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px;font-weight:600;">
                  Store: <strong>${safeStoreName}</strong>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${isResend ? '' : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        <td style="padding:16px 18px;border:1px solid #e0e7ff;border-radius:14px;background:#eef2ff;">
          <p style="margin:0 0 8px 0;font-size:14px;color:#3730a3;font-weight:700;">What happens when you accept</p>
          <ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.7;">
            <li>Your account is created or linked automatically</li>
            <li>You get editor access as soon as you verify</li>
            <li>You can start publishing content immediately</li>
          </ul>
        </td>
      </tr>
    </table>`}

    ${safeMagicLink ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        ${renderButtonCell({
    href: safeMagicLink,
    label: isResend ? 'Open new invite link' : 'Verify invite and continue',
    background: '#6366f1',
    textColor: EMAIL_COLORS.WHITE,
    padding: '13px 26px',
    fontSize: '15px',
    fontWeight: 'bold',
  })}
      </tr>
    </table>` : ''}

    ${isResend ? '' : '<p style="margin:0 0 12px 0;font-size:13px;color:#475569;">This button verifies your invite and signs you in in one step (•‿•).</p>'}
    <p style="margin:0 0 14px 0;padding:10px 14px;border-left:3px solid #6366f1;background:#f8fafc;border-radius:0 8px 8px 0;font-size:13px;line-height:1.7;color:#475569;">${isResend ? 'This refreshed invite link replaces any older invite links and expires in 24 hours.' : 'This invite link expires in 24 hours and can only be used once.'}</p>
    ${safeMagicLink ? `<p style="margin:0 0 14px 0;font-size:12px;color:#94a3b8;">Invite verification link: <a href="${safeMagicLink}" style="color:#6366f1;word-break:break-all;">${safeMagicLink}</a></p>` : ''}
    <p style="margin:0;font-size:13px;color:#475569;">If you weren't expecting this, you can safely ignore it.</p>
  `;

  return emailLayout({
    title: isResend ? `New invite link for ${safeStoreName}` : `Editor invite for ${safeStoreName}`,
    content,
    store: {
      title: safeStoreName,
      slug: safeStoreSlug || 'invite',
      documentId: 'store-invite',
      Favicon: { url: '' },
      settings: {
        email_header_message: isResend
          ? 'Your refreshed invite link'
          : 'You have been invited as an editor',
        store_name_override: safeStoreName,
        welcome_email_text: '',
        dashboard_url: '',
        domain: EMAIL_DEFAULTS.APP_URL,
      },
    },
  });
}

export function buildStoreOwnerCongratsEmailHtml(input: BuildStoreOwnerCongratsEmailHtmlInput): string {
  const {
    ownerName,
    storeName,
    storeSlug,
    isFirstStore = false,
    introLine,
    adviceLine,
  } = input;

  const defaultIntro = isFirstStore
    ? 'Your store is live and the doors are open. Time to share what you love with the world.'
    : 'Your new store is live and ready for its first visitors.';
  const defaultAdvice = 'Easy first moves: add a short About page, publish your first product or event, and upload a logo that feels like you.';
  const safeOwnerName = escapeHtml(ownerName);
  const safeStoreName = escapeHtml(storeName);
  const safeStoreSlug = escapeHtml(storeSlug);
  const safeIntro = escapeHtmlWithBreaks(introLine || defaultIntro);
  const safeAdvice = escapeHtmlWithBreaks(adviceLine || defaultAdvice);

  const content = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        <td style="padding:0;border-radius:16px;border:1px solid #bbf7d0;background:#ffffff;overflow:hidden;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="height:6px;font-size:0;line-height:0;background:linear-gradient(90deg,#16a34a 0%,#22c55e 50%,#0ea5e9 100%);">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:20px 22px;color:#0f172a;">
                <p style="margin:0 0 10px 0;font-size:11px;color:#166534;letter-spacing:.1em;text-transform:uppercase;font-weight:700;">Store launch</p>
                <h2 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#0f172a;">Congrats${safeOwnerName ? `, ${safeOwnerName}` : ''} ✦</h2>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#1e293b;">Your store has been ${isFirstStore ? 'created and linked to your account' : 'created'}.</p>
                ${renderChipRow(LAUNCH_CHIPS)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${safeStoreSlug ? `<p style="margin:0 0 10px 0;font-size:14px;color:#334155;">Store slug: <strong>${safeStoreSlug}</strong></p>` : ''}

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
      <tr>
        <td style="padding:14px 16px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4;">
          <p style="margin:0 0 8px 0;font-size:14px;color:#166534;font-weight:700;">Launch checklist</p>
          <p style="margin:0 0 6px 0;font-size:13px;line-height:1.6;color:#1f2937;">✅ Branding and store details</p>
          <p style="margin:0 0 6px 0;font-size:13px;line-height:1.6;color:#1f2937;">⬜ First product or event published</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#1f2937;">⬜ Share your first update with subscribers</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:10px 0 0 0;">
            <tr>
              <td style="height:7px;background:#dcfce7;border-radius:999px;overflow:hidden;">
                <div style="width:34%;height:7px;background:linear-gradient(90deg,#16a34a 0%,#0ea5e9 100%);"></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;">${safeIntro}</p>
    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;">${safeAdvice}</p>
    ${renderDualButtonRow(
    {
      href: EMAIL_DEFAULTS.APP_URL,
      label: 'Open Markketplace',
      background: EMAIL_COLORS.SKY_500,
      textColor: EMAIL_COLORS.WHITE,
      padding: '12px 22px',
      fontSize: '14px',
      fontWeight: 'bold',
    },
    {
      href: `mailto:${EMAIL_DEFAULTS.SUPPORT_EMAIL}`,
      label: 'Get onboarding help',
      background: EMAIL_COLORS.GREEN_50,
      border: EMAIL_COLORS.GREEN_200,
      textColor: EMAIL_COLORS.GREEN_900,
      padding: '11px 20px',
      fontSize: '13px',
      fontWeight: '700',
    }
  )}
    <p style="margin:0;font-size:13px;color:#475569;">Need help? Reply anytime and we'll guide you (^-^)/.</p>
  `;

  return emailLayout({
    title: `Your store is live: ${safeStoreName}`,
    content,
    store: {
      title: safeStoreName,
      slug: safeStoreSlug || 'store',
      documentId: 'store-owner-onboarding',
      Favicon: {
        url: ''
      },
      settings: {
        email_header_message: `Your store is live!`,
        store_name_override: safeStoreName,
        welcome_email_text: safeIntro,
        dashboard_url: '',
        domain: EMAIL_DEFAULTS.APP_URL
      }
    }
  });
}

interface BuildInviteAcceptedEmailHtmlInput {
  memberName?: string;
  storeName: string;
  storeSlug?: string;
  invitedByName?: string;
}

export function buildInviteAcceptedEmailHtml(input: BuildInviteAcceptedEmailHtmlInput): string {
  const { memberName, storeName, storeSlug, invitedByName } = input;

  const safeMemberName = escapeHtml(memberName);
  const safeStoreName = escapeHtml(storeName);
  const safeStoreSlug = escapeHtml(storeSlug);
  const safeInvitedBy = escapeHtml(invitedByName);

  const MEMBER_CHIPS: Chip[] = [
    { label: 'Access granted', style: CHIP_STYLES.INDIGO },
    { label: 'Ready to publish', style: CHIP_STYLES.TEAL },
    { label: 'Welcome aboard', style: CHIP_STYLES.SKY },
  ];

  const content = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        <td style="padding:0;border-radius:16px;border:1px solid #bfdbfe;background:#ffffff;overflow:hidden;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="height:6px;font-size:0;line-height:0;background:linear-gradient(90deg,#6366f1 0%,#0ea5e9 55%,#22d3ee 100%);">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:20px 22px;color:#0f172a;">
                <p style="margin:0 0 10px 0;font-size:11px;color:#4338ca;letter-spacing:.1em;text-transform:uppercase;font-weight:700;">Team access</p>
                <h2 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#0f172a;">You're in${safeMemberName ? `, ${safeMemberName}` : ''} ✦</h2>
                <p style="margin:0 0 10px 0;font-size:15px;line-height:1.7;color:#1e293b;">
                  ${safeInvitedBy ? `<strong>${safeInvitedBy}</strong> added you as an editor on ` : 'You have been added as an editor on '}<strong>${safeStoreName}</strong>.
                </p>
                ${renderChipRow(MEMBER_CHIPS)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
      <tr>
        <td style="padding:14px 16px;border:1px solid #e0e7ff;border-radius:12px;background:#eef2ff;">
          <p style="margin:0 0 8px 0;font-size:14px;color:#3730a3;font-weight:700;">What you can do now</p>
          <p style="margin:0 0 6px 0;font-size:13px;line-height:1.6;color:#1f2937;">✦ Create and publish articles, pages, and products</p>
          <p style="margin:0 0 6px 0;font-size:13px;line-height:1.6;color:#1f2937;">✦ Manage events and respond to RSVPs</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#1f2937;">✦ Upload media and update store content</p>
        </td>
      </tr>
    </table>

    ${renderDualButtonRow(
    {
      href: EMAIL_DEFAULTS.APP_URL,
      label: 'Open dashboard',
      background: '#6366f1',
      textColor: EMAIL_COLORS.WHITE,
      padding: '13px 26px',
      fontSize: '15px',
      fontWeight: 'bold',
    },
    {
      href: `mailto:${EMAIL_DEFAULTS.SUPPORT_EMAIL}`,
      label: 'Get help',
      background: EMAIL_COLORS.SLATE_100,
      border: EMAIL_COLORS.SLATE_200,
      textColor: EMAIL_COLORS.SLATE_700,
      padding: '12px 22px',
      fontSize: '13px',
      fontWeight: '700',
    }
  )}
    <p style="margin:0;font-size:13px;color:#475569;">If you weren't expecting this access, reply and we'll sort it out.</p>
  `;

  return emailLayout({
    title: `You've joined ${safeStoreName} on Markketplace`,
    content,
    store: {
      title: safeStoreName,
      slug: safeStoreSlug || 'store',
      documentId: 'store-invite-accepted',
      Favicon: { url: '' },
      settings: {
        email_header_message: `Welcome to the team`,
        store_name_override: safeStoreName,
        welcome_email_text: '',
        dashboard_url: '',
        domain: EMAIL_DEFAULTS.APP_URL,
      },
    },
  });
}
