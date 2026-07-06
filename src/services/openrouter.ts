type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenRouterChatInput = {
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

type OpenRouterChatResult = {
  ok: boolean;
  content: string;
  model: string | null;
  reason?: string;
};

const OPEN_ROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPEN_ROUTER_DEFAULT_MODEL = 'openai/gpt-4o-mini';

const DEFAULT_DENYLIST = [
  'kill yourself',
  'how to make a bomb',
  'credit card dump',
  'stolen card',
  'child sexual',
  'rape',
];

function getDenylist(): string[] {
  const envList = String(process.env.OPEN_ROUTER_DENYLIST || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_DENYLIST, ...envList]));
}

export function isOpenRouterInputDenied(input: string): { denied: boolean; reason?: string } {
  const normalized = String(input || '').toLowerCase();
  if (!normalized.trim()) {
    return { denied: false };
  }

  for (const token of getDenylist()) {
    if (normalized.includes(token)) {
      return { denied: true, reason: `matched denylist token: ${token}` };
    }
  }

  return { denied: false };
}

export function parseJsonFromModelText(raw: string): any {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_error) {
    // Continue and try to recover wrapped JSON.
  }

  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    const arrayCandidate = text.slice(firstArray, lastArray + 1);
    try {
      return JSON.parse(arrayCandidate);
    } catch (_error) {
      // Continue trying object extraction.
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const objectCandidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(objectCandidate);
    } catch (_error) {
      return null;
    }
  }

  return null;
}

export function forceOneSentence(value: string, fallback: string): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;

  const firstSentence = normalized.split(/(?<=[.!?])\s+/).filter(Boolean)[0] || normalized;
  const truncated = firstSentence.slice(0, 180).trim();
  if (!truncated) return fallback;

  if (/[.!?]$/.test(truncated)) {
    return truncated;
  }

  return `${truncated}.`;
}

export async function openRouterChatCompletion(input: OpenRouterChatInput): Promise<OpenRouterChatResult> {
  const apiKey = String(process.env.OPEN_ROUTER_API_KEY || '').trim();
  const model = String(input.model || process.env.OPEN_ROUTER_MODEL || OPEN_ROUTER_DEFAULT_MODEL).trim() || OPEN_ROUTER_DEFAULT_MODEL;

  if (!apiKey) {
    return {
      ok: false,
      content: '',
      model: null,
      reason: 'OPEN_ROUTER_API_KEY not configured',
    };
  }

  const mergedInput = input.messages.map((entry) => entry.content).join('\n').slice(0, 6000);
  const denyCheck = isOpenRouterInputDenied(mergedInput);
  if (denyCheck.denied) {
    return {
      ok: false,
      content: '',
      model,
      reason: denyCheck.reason || 'input denied by policy',
    };
  }

  try {
    const response = await fetch(OPEN_ROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 300,
        messages: input.messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        content: '',
        model,
        reason: `openrouter_http_${response.status}:${detail.slice(0, 160)}`,
      };
    }

    const payload = await response.json() as any;
    const content = payload?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((part: any) => String(part?.text || part?.content || '')).join('\n').trim()
      : String(content || '').trim();

    if (!text) {
      return {
        ok: false,
        content: '',
        model,
        reason: 'empty_model_response',
      };
    }

    return {
      ok: true,
      content: text,
      model,
    };
  } catch (error: any) {
    return {
      ok: false,
      content: '',
      model,
      reason: error?.message || 'openrouter_request_failed',
    };
  }
}
