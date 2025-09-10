/**
 * Response Formatters - Your clean patterns extended
 */

export class ResponseFormatter {
  // Customer-specific formatting following your patterns
  static customer(customer: any) {
    return {
      id: customer.documentId,
      email: customer.email,
      name: `${customer.firstName} ${customer.lastName}`.trim(),
      phone: customer.phone,
      spent: customer.totalSpent || 0,
      sessions: customer.totalSessions || 0,
      lastSeen: customer.lastSessionDate,
      active: customer.isActive,
      recent: (customer.appointments || []).slice(0, 2)
    };
  }

  // Search results with your metadata pattern
  static searchResults<T>(data: T[], query: string, hasMore: boolean) {
    return {
      data,
      meta: {
        query,
        count: data.length,
        hasMore
      }
    };
  }

  // Stats following your analytics approach
  static stats(totals: any) {
    return {
      data: {
        ...totals,
        activeRate: totals.total > 0 ? Math.round((totals.active / totals.total) * 100) : 0
      }
    };
  }

  // Error responses using your concise style
  static error(ctx: any, type: 'missing' | 'forbidden' | 'failed', resource?: string) {
    const messages = {
      missing: `missing[${resource}]`,
      forbidden: resource || 'access_denied',
      failed: `${resource}_failed`
    };

    const methods = {
      missing: 'badRequest',
      forbidden: 'forbidden',
      failed: 'internalServerError'
    };

    return ctx[methods[type]](messages[type]);
  }
}
