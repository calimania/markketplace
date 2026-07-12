type StarterPageTemplate = {
  Title: string;
  slug: string;
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
              text: `${storeName} is a focused space for useful ideas, practical resources, and updates that help people move forward.`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Start with the essentials, explore what is new, and check back for steady improvements each week.',
            },
          ],
        },
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
              text: `Sign up for useful updates, new ideas, and occasional highlights from ${storeName}.`,
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
        metaDescription: `Subscribe to ${storeName} for clear updates, practical ideas, and occasional highlights.`,
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
              text: `${storeName} exists to share thoughtful work, useful guidance, and a clear perspective on what matters.`,
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Everything here is designed to be practical, trustworthy, and easy to apply in real life.',
            },
          ],
        },
      ],
      SEO: {
        metaTitle: `About ${storeName}`,
        metaDescription: `Learn the story behind ${storeName} and the values guiding its work and updates.`,
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

function buildStarterArticleTemplate(storeName: string, storeSlug: string): StarterArticleTemplate {
  return {
    Title: `A first note from ${storeName}`,
    slug: `first-note-${storeSlug}`,
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
            text: 'Expect useful ideas, occasional stories, and timely updates whenever something meaningful is ready.',
          },
        ],
      },
    ],
    SEO: {
      metaTitle: `A first note from ${storeName}`,
      metaDescription: `Meet ${storeName} in this opening note and discover what is coming next.`,
    },
  };
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

export async function upsertStarterArticleForStore(strapiInstance: any, params: {
  storeDocumentId: string;
  template: StarterArticleTemplate;
  regenerate: boolean;
}) {
  const { storeDocumentId, template, regenerate } = params;

  const existingArticles = await strapiInstance.documents('api::article.article').findMany({
    filters: {
      store: { documentId: storeDocumentId },
      slug: template.slug,
    },
    fields: ['documentId', 'slug', 'publishedAt'],
    limit: 1,
  }) as any[];

  const existing = existingArticles?.[0] || null;

  if (existing && !regenerate) {
    if (existing?.documentId && !existing?.publishedAt) {
      await strapiInstance.documents('api::article.article').publish({
        documentId: existing.documentId,
      });
    }

    return { status: 'skipped', slug: template.slug, documentId: existing.documentId };
  }

  if (existing?.documentId) {
    await strapiInstance.documents('api::article.article').update({
      documentId: existing.documentId,
      data: {
        Title: template.Title,
        slug: template.slug,
        store: storeDocumentId,
        Content: template.Content,
        SEO: template.SEO,
      } as any,
    });

    await strapiInstance.documents('api::article.article').publish({ documentId: existing.documentId });

    return { status: 'updated', slug: template.slug, documentId: existing.documentId };
  }

  const starterArticle = await strapiInstance.documents('api::article.article').create({
    data: {
      Title: template.Title,
      slug: template.slug,
      store: storeDocumentId,
      Content: template.Content,
      SEO: template.SEO,
    } as any,
  });

  await strapiInstance.documents('api::article.article').publish({ documentId: starterArticle.documentId });

  return { status: 'created', slug: template.slug, documentId: starterArticle.documentId };
}

export async function seedStarterContent(strapiInstance: any, context: StarterSeedContext & { ownerId: number | string }) {
  await seedAndPublishStarterPages(strapiInstance, {
    defaultLocale: context.defaultLocale,
    storeDocumentId: context.storeDocumentId,
    ownerId: context.ownerId,
    storeName: context.storeName,
  });

  await upsertStarterArticleForStore(strapiInstance, {
    storeDocumentId: context.storeDocumentId,
    template: buildStarterArticleTemplate(context.storeName, context.storeSlug),
    regenerate: false,
  });
}
