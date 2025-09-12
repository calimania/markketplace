/**
 * product controller
 */

import { factories } from '@strapi/strapi'
import { syncProductWithStripe } from '../../../services/stripe-sync';

const coreController = factories.createCoreController('api::product.product', ({ strapi }) => ({
  async stripeSync(ctx) {
    const { documentId } = ctx.params;

    if (!documentId) {
      ctx.status = 400;
      ctx.body = { error: 'Missing documentId' };
      return;
    }

    // Fetch product
    const product = await strapi.documents('api::product.product').findOne({
      documentId,
      populate: ['PRICES', 'Thumbnail', 'Slides']
    });

    if (!product) {
      ctx.status = 404;
      ctx.body = { error: 'Product not found' };
      return;
    }

    try {
      // Sync with Stripe, update SKU and prices, resolve useful data
      const syncResult = await syncProductWithStripe(product, { strapi, ctx });
      ctx.body = {
        success: true,
        message: 'Stripe sync completed.',
        result: syncResult,
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  }
}));


export default coreController;
