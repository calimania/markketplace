/**
 * Enhanced Query Builder - extends your pattern
 * Fixed for Strapi v5 Document API types
 */

export class DocumentQueryBuilder {
  private filters: any = {};
  private populates: any = {};
  private sortBy: string = 'updatedAt:desc';
  private limitValue: number = 10;

  static forStore(storeId: string) {
    const builder = new DocumentQueryBuilder();
    builder.filters.store = { documentId: storeId };
    return builder;
  }

  search(query: string, fields: string[]) {
    if (query && query.length >= 2) {
      this.filters.$or = fields.map(field => ({
        [field]: { $containsi: query }
      }));
    }
    return this;
  }

  populate(config: any) {
    this.populates = { ...this.populates, ...config };
    return this;
  }

  sort(sortBy: string) {
    this.sortBy = sortBy;
    return this;
  }

  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  build() {
    return {
      filters: this.filters,
      populate: this.populates,
      sort: this.sortBy, // String instead of array
      limit: this.limitValue
    };
  }
}

// Fixed usage example - returns query config, not direct results
export const buildCustomerSearchQuery = (storeId: string, query: string) => {
  return DocumentQueryBuilder
    .forStore(storeId)
    .search(query, ['email', 'firstName', 'lastName', 'phone'])
    .populate({
      appointments: {
        fields: ['appointmentDate', 'status', 'type'],
        sort: 'appointmentDate:desc',
        limit: 3
      }
    })
    .sort('updatedAt:desc')
    .limit(10)
    .build();
};

// Usage in controller:
// const queryConfig = buildCustomerSearchQuery(storeId, query);
// const customers = await strapi.documents('api::customer.customer').findMany(queryConfig);
