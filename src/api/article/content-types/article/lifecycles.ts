const slugify = (str: string) => {
  return str
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/[^\w-]+/g, '');
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
};

const ensureSlug = (article: any) => {
  if (!article.slug && article.Title) {
    const datePrefix = formatDate(new Date(article.createdAt));
    article.slug = `${datePrefix}-${slugify(article.Title)}`;
  }
  return article;
};

export default {
  beforeCreate(event) {
    const { data } = event.params;
    if (!data.slug && data.Title) {
      const datePrefix = formatDate(new Date());
      data.slug = `${datePrefix}-${slugify(data.Title)}`;
    }
  },

  beforeUpdate(event) {
    const { data, where } = event.params;
    if (data.Title && !data.slug) {
      const datePrefix = formatDate(new Date());
      data.slug = `${datePrefix}-${slugify(data.Title)}`;
    }
  },

  afterFindOne(event) {
    const { result } = event;

    if (result) {
      const updated = ensureSlug(result);

      if (result.slug !== updated.slug) {
        strapi.db.query('api::article.article').update({
          where: { id: result.id },
          data: { slug: updated.slug }
        });
      }
    }
  },

  afterFindMany(event) {
    const { result } = event;
    if (result) {
      const updates = [];
      result.forEach(article => {
        const updated = ensureSlug(article);

        if (article.slug !== updated.slug) {
          updates.push(
            strapi.db.query('api::article.article').update({
              where: { id: article.id },
              data: { slug: updated.slug }
            })
          );
        }
      });

      if (updates.length > 0) {
        Promise.all(updates).catch(console.error);
      }
    }
  }
};
