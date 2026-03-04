/**
 * subscriber router
 */

import { factories } from '@strapi/strapi';

/**
 * TODO(newsletter-phase-1): Planned custom routes
 * - POST /subscribers/subscribe
 * - GET /subscribers/:documentId/sync-status
 * - POST /subscribers/:documentId/sync
 *
 * Note: Keep core router for now; add explicit custom route file when implementation begins.
 */

export default factories.createCoreRouter('api::subscriber.subscriber');
