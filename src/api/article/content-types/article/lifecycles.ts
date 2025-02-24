const slugify = (str: string) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/ /g, '-')
    .replace(/[^\w-]+/g, '');
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
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
};
