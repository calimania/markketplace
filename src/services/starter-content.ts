import { openRouterChatCompletion, parseJsonFromModelText } from './openrouter';

type StarterPageTemplate = {
  Title: string;
  slug: 'home' | 'newsletter' | 'about';
  SEO: {
    metaTitle: string;
    metaDescription: string;
  };
  Content?: any[];
};

type StarterArticleTemplate = {
  Title: string;
  slug: string;
  SEO: {
    metaTitle: string;
    metaDescription: string;
  };
  Content?: any[];
};

type StarterOwnerEmailTemplate = {
  subject: string;
  introLine: string;
  adviceLine: string;
};

type GenerateStarterPagesInput = {
  storeName: string;
  storeSlug: string;
  storeDescription?: string;
  seed?: string;
  voice?: string;
};

type GenerateStarterPagesResult = {
  pages: StarterPageTemplate[];
  article: StarterArticleTemplate;
  ownerEmail: StarterOwnerEmailTemplate;
  source: 'openrouter' | 'fallback';
  model: string | null;
  warning?: string;
};

const OPEN_ROUTER_MODEL_DEFAULT = 'openai/gpt-4o-mini';
const PAGE_ORDER: Array<'home' | 'newsletter' | 'about'> = ['home', 'newsletter', 'about'];

function clampText(value: unknown, fallback: string, maxLength = 220): string {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function toParagraphBlock(text: string) {
  return {
    type: 'paragraph',
    children: [{ type: 'text', text }],
  };
}

function toHeadingBlock(text: string) {
  return {
    type: 'heading',
    level: 1,
    children: [{ type: 'text', text }],
  };
}

function fallbackStarterPages(storeName: string): StarterPageTemplate[] {
  return [
    {
      Title: 'Homepage',
      slug: 'home',
      Content: [
        toHeadingBlock(`Welcome to ${storeName}`),
        toParagraphBlock(`${storeName} is a focused space for useful ideas, practical resources, and updates that help people move forward.`),
        toParagraphBlock('Start with the essentials, explore what is new, and check back for steady improvements each week.'),
      ],
      SEO: {
        metaTitle: `${storeName} Home`,
        metaDescription: `Explore ${storeName}: useful resources, fresh updates, and a clear path to get started.`,
      },
    },
    {
      Title: `${storeName} Newsletter`,
      slug: 'newsletter',
      Content: [
        toHeadingBlock('Stay close to the story'),
        toParagraphBlock(`Sign up for useful updates, new ideas, and occasional highlights from ${storeName}.`),
        toParagraphBlock('No noise, just meaningful updates when there is something genuinely worth sharing.'),
      ],
      SEO: {
        metaTitle: `${storeName} Newsletter`,
        metaDescription: `Subscribe to ${storeName} for clear updates, practical ideas, and occasional highlights.`,
      },
    },
    {
      Title: `About ${storeName}`,
      slug: 'about',
      Content: [
        toHeadingBlock('About'),
        toParagraphBlock(`${storeName} exists to share thoughtful work, useful guidance, and a clear perspective on what matters.`),
        toParagraphBlock('Everything here is designed to be practical, trustworthy, and easy to apply in real life.'),
      ],
      SEO: {
        metaTitle: `About ${storeName}`,
        metaDescription: `Learn the story behind ${storeName} and the values guiding its work and updates.`,
      },
    },
  ];
}

function fallbackStarterArticle(storeName: string, storeSlug: string): StarterArticleTemplate {
  return {
    Title: `A first note from ${storeName}`,
    slug: `first-note-${storeSlug}`,
    Content: [
      toHeadingBlock(`Hello from ${storeName}`),
      toParagraphBlock(`${storeName} is now open, and this first note is our way of saying welcome.`),
      toParagraphBlock('Expect useful ideas, occasional stories, and timely updates whenever something meaningful is ready.'),
    ],
    SEO: {
      metaTitle: `A first note from ${storeName}`,
      metaDescription: `Meet ${storeName} in this opening note and discover what is coming next.`,
    },
  };
}

function fallbackOwnerEmail(storeName: string): StarterOwnerEmailTemplate {
  return {
    subject: `Congrats on your new store: ${storeName}`,
    introLine: 'Your space is live. Start by publishing your homepage and one core page this week.',
    adviceLine: 'Keep copy short and clear, and publish one small improvement regularly.',
  };
}

function summarizeDomainSignals(input: GenerateStarterPagesInput): string {
  const description = String(input.storeDescription || '').replace(/\s+/g, ' ').trim();
  const seed = String(input.seed || '').replace(/\s+/g, ' ').trim();
  const combined = `${input.storeName} ${input.storeSlug} ${description} ${seed}`.toLowerCase();

  const domainMap: Array<{ label: string; keywords: string[] }> = [
    { label: 'food-and-recipes', keywords: ['recipe', 'recipes', 'kitchen', 'cooking', 'food', 'chef', 'meal'] },
    { label: 'coaching-and-education', keywords: ['coach', 'coaching', 'mentor', 'course', 'learn', 'teaching', 'training'] },
    { label: 'pets-and-animal-care', keywords: ['dog', 'cat', 'pet', 'veterinary', 'grooming', 'animal'] },
    { label: 'creative-portfolio', keywords: ['studio', 'design', 'photography', 'artist', 'portfolio', 'creative'] },
    { label: 'community-and-events', keywords: ['community', 'event', 'workshop', 'club', 'meetup'] },
    { label: 'commerce-and-products', keywords: ['shop', 'store', 'product', 'catalog', 'buy', 'sale', 'ecommerce'] },
  ];

  const inferred = domainMap
    .filter((entry) => entry.keywords.some((keyword) => combined.includes(keyword)))
    .map((entry) => entry.label)
    .slice(0, 2);

  const hints = inferred.length > 0 ? inferred.join(', ') : 'general website or service';
  const descriptionSnippet = description ? `Store description: ${description.slice(0, 500)}` : 'Store description: none provided';

  return `${descriptionSnippet}. Inferred domain hints: ${hints}.`;
}

function normalizeParagraphs(paragraphs: unknown, fallback: string[]): string[] {
  if (!Array.isArray(paragraphs)) {
    return fallback;
  }

  const normalized = paragraphs
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAiPages(input: unknown, storeName: string): StarterPageTemplate[] {
  const defaults = fallbackStarterPages(storeName);
  const bySlug = new Map<string, StarterPageTemplate>(defaults.map((page) => [page.slug, page]));
  const arrayInput = Array.isArray(input)
    ? input
    : (Array.isArray((input as any)?.pages) ? (input as any).pages : []);

  const rawBySlug = new Map<string, any>();
  for (const item of arrayInput) {
    const slug = String(item?.slug || '').trim().toLowerCase();
    if (PAGE_ORDER.includes(slug as any)) {
      rawBySlug.set(slug, item);
    }
  }

  return PAGE_ORDER.map((slug) => {
    const defaultPage = bySlug.get(slug)!;
    const rawPage = rawBySlug.get(slug) || {};

    const title = clampText(rawPage?.title, defaultPage.Title, 90);
    const seoDescription = clampText(rawPage?.seoDescription, defaultPage.SEO.metaDescription, 160);
    const heading = clampText(rawPage?.heading, title, 120);
    const defaultParagraphs = (defaultPage.Content || [])
      .filter((block: any) => block?.type === 'paragraph')
      .map((block: any) => String(block?.children?.[0]?.text || '').trim())
      .filter(Boolean);
    const paragraphs = normalizeParagraphs(rawPage?.paragraphs, defaultParagraphs);

    return {
      Title: title,
      slug,
      Content: [toHeadingBlock(heading), ...paragraphs.map(toParagraphBlock)],
      SEO: {
        metaTitle: clampText(rawPage?.seoTitle, `${storeName} ${title}`, 70),
        metaDescription: seoDescription,
      },
    };
  });
}

function normalizeAiArticle(input: unknown, storeName: string, storeSlug: string): StarterArticleTemplate {
  const fallback = fallbackStarterArticle(storeName, storeSlug);
  const rawArticle = input && typeof input === 'object' && !Array.isArray(input)
    ? ((input as any).article || input)
    : {};

  const title = clampText(rawArticle?.title, fallback.Title, 110);
  const heading = clampText(rawArticle?.heading, title, 120);
  const defaultParagraphs = (fallback.Content || [])
    .filter((block: any) => block?.type === 'paragraph')
    .map((block: any) => String(block?.children?.[0]?.text || '').trim())
    .filter(Boolean);
  const paragraphs = normalizeParagraphs(rawArticle?.paragraphs, defaultParagraphs);

  return {
    Title: title,
    slug: clampText(rawArticle?.slug, fallback.slug, 120).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback.slug,
    Content: [toHeadingBlock(heading), ...paragraphs.map(toParagraphBlock)],
    SEO: {
      metaTitle: clampText(rawArticle?.seoTitle, fallback.SEO.metaTitle, 70),
      metaDescription: clampText(rawArticle?.seoDescription, fallback.SEO.metaDescription, 160),
    },
  };
}

function buildPrompt(input: GenerateStarterPagesInput): string {
  const seedLine = input.seed?.trim() ? `Seed guidance: ${input.seed.trim()}` : 'Seed guidance: none';
  const voiceLine = input.voice?.trim() ? input.voice.trim() : 'Markket voice: modern, thoughtful, independent, useful, no hype.';
  const domainLine = summarizeDomainSignals(input);

  return [
    'You are writing concise launch content for a new project in the Markketplace ecosystem.',
    `Store name: ${input.storeName}`,
    `Store slug: ${input.storeSlug}`,
    domainLine,
    `Voice: ${voiceLine}`,
    seedLine,
    'Return valid JSON only as one object with this exact shape:',
    '{"pages":[{"slug":"home|newsletter|about","title":"","heading":"","paragraphs":["",""],"seoTitle":"","seoDescription":""}],"article":{"slug":"first-note-store-slug","title":"","heading":"","paragraphs":["",""],"seoTitle":"","seoDescription":""}}',
    'Constraints:',
    '- Adapt copy to the domain indicated by name, slug, description, and seed.',
    '- Do not assume this is an online shop unless the context clearly indicates commerce.',
    '- No markdown, no HTML, no emojis.',
    '- Include exactly 3 pages in this order: home, newsletter, about.',
    '- Include exactly 1 article that feels like a first post or launch note.',
    '- Each paragraph should be 1 sentence.',
    '- Keep SEO description under 160 characters.',
  ].join('\n');
}

export async function generateStarterPagesWithVoice(input: GenerateStarterPagesInput): Promise<GenerateStarterPagesResult> {
  const storeName = String(input.storeName || '').trim() || 'My Store';
  const storeSlug = String(input.storeSlug || '').trim() || 'my-store';
  const model = String(process.env.OPEN_ROUTER_MODEL || OPEN_ROUTER_MODEL_DEFAULT).trim() || OPEN_ROUTER_MODEL_DEFAULT;

  try {
    const completion = await openRouterChatCompletion({
      model,
      temperature: 0.9,
      maxTokens: 1000,
      messages: [
        {
          role: 'system',
          content: 'You are a brand copywriter. Return only strict JSON that matches the requested schema.',
        },
        {
          role: 'user',
          content: buildPrompt({
            storeName,
            storeSlug,
            storeDescription: input.storeDescription,
            seed: input.seed,
            voice: input.voice,
          }),
        },
      ],
    });

    if (!completion.ok) {
      throw new Error(completion.reason || 'OpenRouter generation unavailable');
    }

    const parsed = parseJsonFromModelText(completion.content);
    const parsedArray = Array.isArray(parsed)
      ? parsed
      : (Array.isArray((parsed as any)?.pages) ? (parsed as any).pages : null);

    if (!parsed && !parsedArray) {
      throw new Error('OpenRouter response did not contain valid JSON.');
    }

    return {
      pages: normalizeAiPages(parsedArray || parsed, storeName),
      article: normalizeAiArticle(parsed, storeName, storeSlug),
      ownerEmail: fallbackOwnerEmail(storeName),
      source: 'openrouter',
      model: completion.model,
    };
  } catch (error: any) {
    return {
      pages: fallbackStarterPages(storeName),
      article: fallbackStarterArticle(storeName, storeSlug),
      ownerEmail: fallbackOwnerEmail(storeName),
      source: 'fallback',
      model,
      warning: error?.message || 'OpenRouter generation failed; using fallback templates.',
    };
  }
}
