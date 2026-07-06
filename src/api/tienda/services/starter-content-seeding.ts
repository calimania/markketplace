type StarterPageTemplate = {
  Title: string;
  slug: string;
  SEO: {
    metaTitle: string;
    metaDescription: string;
  };
  Content?: any[];
};

type StarterSeedContext = {
  defaultLocale: string;
  storeDocumentId: string;
  storeName: string;
  storeSlug: string;
};

function buildStarterPageTemplates(storeName: string): StarterPageTemplate[] {
  return [
    {
      Title: 'Homepage',
      slug: 'home',
      Content: [
        {
          type: 'heading',
          level: 1,
          children: [
            {
              type: 'text',
              text: `Welcome to ${storeName}`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: `${storeName} is a curated storefront for thoughtful finds, fresh drops, and stories worth your attention.`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Browse the latest highlights, discover what is new this week, and check back often for upcoming releases.',
            },
          ],
        },
      ],
      SEO: {
        metaTitle: `${storeName} Home`,
        metaDescription: `Discover ${storeName}: curated products, new arrivals, and stories from the studio.`,
      },
    },
    {
      Title: `${storeName} Newsletter`,
      slug: 'newsletter',
      Content: [
        {
          type: 'heading',
          level: 1,
          children: [
            {
              type: 'text',
              text: 'Stay close to the story',
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: `Sign up for launch notes, restock alerts, and occasional highlights from ${storeName}.`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'No noise, just meaningful updates when there is something genuinely worth sharing.',
            },
          ],
        },
      ],
      SEO: {
        metaTitle: `${storeName} Newsletter`,
        metaDescription: `Subscribe to ${storeName} for launch notes, restocks, and occasional highlights.`,
      },
    },
    {
      Title: `About ${storeName}`,
      slug: 'about',
      Content: [
        {
          type: 'heading',
          level: 1,
          children: [
            {
              type: 'text',
              text: 'About',
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: `${storeName} curates independent products and small-batch releases for people who care about craft and detail.`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'From everyday staples to limited drops, every selection is chosen for quality, usefulness, and character.',
            },
          ],
        },
      ],
      SEO: {
        metaTitle: `About ${storeName}`,
        metaDescription: `Learn the story behind ${storeName} and the values that shape each release.`,
      },
    },
  ];
}

export async function upsertDefaultStarterPagesForStore(strapiInstance: any, params: {
  defaultLocale: string;
  storeDocumentId: string;
  ownerId: number | string;
  storeName: string;
  regenerate: boolean;
}) {
  const { defaultLocale, storeDocumentId, ownerId, storeName, regenerate } = params;
  return upsertStarterPagesForStore(strapiInstance, {
    defaultLocale,
    storeDocumentId,
    ownerId,
    templates: buildStarterPageTemplates(storeName),
    regenerate,
  });
}

async function seedAndPublishStarterPages(strapiInstance: any, params: {
  defaultLocale: string;
  storeDocumentId: string;
  ownerId: number | string;
  storeName: string;
}) {
  const { defaultLocale, storeDocumentId, ownerId, storeName } = params;
  await upsertDefaultStarterPagesForStore(strapiInstance, {
    defaultLocale,
    storeDocumentId,
    ownerId,
    storeName,
    regenerate: false,
  });
}

export async function upsertStarterPagesForStore(strapiInstance: any, params: {
  defaultLocale: string;
  storeDocumentId: string;
  ownerId: number | string;
  templates: StarterPageTemplate[];
  regenerate: boolean;
}) {
  const { defaultLocale, storeDocumentId, ownerId, templates, regenerate } = params;

  const existingPages = await strapiInstance.documents('api::page.page').findMany({
    locale: defaultLocale,
    filters: {
      store: { documentId: storeDocumentId },
      slug: { $in: templates.map(page => page.slug) },
    },
    fields: ['documentId', 'slug', 'publishedAt'],
    limit: 20,
  }) as any[];

  const existingBySlug = new Map<string, any>();
  for (const page of existingPages || []) {
    if (page?.slug) {
      existingBySlug.set(String(page.slug), page);
    }
  }

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const template of templates) {
    const existing = existingBySlug.get(template.slug);

    if (existing && !regenerate) {
      // Keep deterministic content untouched but ensure it is published for storefront use.
      if (existing?.documentId && !existing?.publishedAt) {
        await strapiInstance.documents('api::page.page').publish({
          documentId: existing.documentId,
          locale: defaultLocale,
        });
      }
      skipped.push(template.slug);
      continue;
    }

    if (existing?.documentId) {
      await strapiInstance.documents('api::page.page').update({
        documentId: existing.documentId,
        locale: defaultLocale,
        data: {
          Title: template.Title,
          Active: true,
          SEO: template.SEO,
          Content: template.Content,
        } as any,
      });

      await strapiInstance.documents('api::page.page').publish({
        documentId: existing.documentId,
        locale: defaultLocale,
      });

      updated.push(template.slug);
      continue;
    }

    const createdPage = await strapiInstance.documents('api::page.page').create({
      locale: defaultLocale,
      data: {
        Title: template.Title,
        slug: template.slug,
        Active: true,
        store: storeDocumentId,
        owner: ownerId,
        SEO: template.SEO,
        ...(template.Content ? { Content: template.Content } : {}),
      } as any,
    });

    await strapiInstance.documents('api::page.page').publish({
      documentId: createdPage.documentId,
      locale: defaultLocale,
    });

    created.push(template.slug);
  }

  return { created, updated, skipped };
}

async function seedStarterArticle(strapiInstance: any, { storeDocumentId, storeName, storeSlug }: StarterSeedContext) {
  const starterArticle = await strapiInstance.documents('api::article.article').create({
    data: {
      Title: `A first note from ${storeName}`,
      slug: `first-note-${storeSlug}`,
      store: storeDocumentId,
      description: `A short launch story to make ${storeName} feel alive on day one.`,
      Content: [
        {
          type: 'heading',
          level: 1,
          children: [
            {
              type: 'text',
              text: `Hello from ${storeName}`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: `${storeName} is now open, and this first note is our way of saying welcome.`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Expect a curated mix of products, occasional stories, and timely updates whenever something new arrives.',
            },
          ],
        },
      ],
      SEO: {
        metaTitle: `A first note from ${storeName}`,
        metaDescription: `Meet ${storeName} in this opening note and discover what is coming next.`,
      },
    } as any,
  });

  await strapiInstance.documents('api::article.article').publish({ documentId: starterArticle.documentId });
}

export async function seedStarterContent(strapiInstance: any, context: StarterSeedContext & { ownerId: number | string }) {
  await seedAndPublishStarterPages(strapiInstance, {
    defaultLocale: context.defaultLocale,
    storeDocumentId: context.storeDocumentId,
    ownerId: context.ownerId,
    storeName: context.storeName,
  });

  await seedStarterArticle(strapiInstance, context);
}
