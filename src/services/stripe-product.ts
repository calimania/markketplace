import Stripe from 'stripe';
import { getStripeClient, getFullImageUrl, stripsMarkdown } from './stripe';

/**
 * Create a new Stripe product
 */
export async function createStripeProduct(product: any): Promise<string | null> {
  const stripeClient = getStripeClient();
  if (!stripeClient) {
    console.warn('[STRIPE_PRODUCT_SERVICE] No Stripe client available');
    return null;
  }

  // Input validation
  if (!product?.Name || typeof product.Name !== 'string') {
    console.error('[STRIPE_PRODUCT_SERVICE] Invalid or missing product name');
    return null;
  }

  if (product.Name.length > 250) {
    console.error('[STRIPE_PRODUCT_SERVICE] Product name too long (max 250 characters)');
    return null;
  }

  console.log('[STRIPE_PRODUCT_SERVICE] Creating Stripe product');

  // Determine if this is a digital product
  const isDigitalProduct = product.Name.toLowerCase().includes('digital');
  console.log(`[STRIPE_PRODUCT_SERVICE] Product type detected: ${isDigitalProduct ? 'Digital' : 'Physical'} (based on name: "${product.Name}")`);

  const productData: Stripe.ProductCreateParams = {
    name: product.Name,
    description: product.Description ? stripsMarkdown(product.Description) : undefined,
    active: product.active !== false,
    metadata: {
      strapiId: product.documentId || product.id || '',
      slug: product.slug || '',
      environment: process.env.NODE_ENV || 'development',
      lastSyncedAt: new Date().toISOString(),
      version: '1.0',
      productType: isDigitalProduct ? 'digital' : 'physical',
    },
  };

  // Configure product type and shipping settings
  if (isDigitalProduct) {
    // Digital product configuration
    productData.type = 'service'; // Digital goods are services in Stripe
    console.log('[STRIPE_PRODUCT_SERVICE] Configured as digital product (service type)');
  } else {
    // Physical product configuration
    productData.type = 'good'; // Physical goods
    productData.shippable = true;

    // Set package dimensions if available, otherwise use defaults
    if (product.Weight || product.Dimensions) {
      productData.package_dimensions = {
        height: product.Dimensions?.height || 2, // inches
        length: product.Dimensions?.length || 8,
        width: product.Dimensions?.width || 6,
        weight: product.Weight || 4, // ounces
      };
    } else {
      // Default package dimensions for physical goods
      productData.package_dimensions = {
        height: 2,
        length: 8,
        width: 6,
        weight: 4,
      };
    }

    console.log('[STRIPE_PRODUCT_SERVICE] Configured as physical product with shipping:', {
      shippable: true,
      dimensions: productData.package_dimensions
    });
  }

  // Add images if available
  if (product.Thumbnail?.url) {
    productData.images = [getFullImageUrl(product.Thumbnail.url)];
  } else if (product.Slides && product.Slides.length > 0) {
    productData.images = product.Slides
      .filter((slide: any) => slide.url)
      .slice(0, 8)
      .map((slide: any) => getFullImageUrl(slide.url));
  } else {
    console.warn('[STRIPE_PRODUCT_SERVICE] No Thumbnail or Slides found for product images. Skipping image sync.');
  }

  try {
    const stripeProduct = await stripeClient.products.create(productData);
    console.log('[STRIPE_PRODUCT_SERVICE] Stripe product created successfully', {
      stripeProductId: stripeProduct.id,
      productName: product.Name,
    });
    return stripeProduct.id;
  } catch (error) {
    console.error('[STRIPE_PRODUCT_SERVICE] Failed to create Stripe product:', error);
    return null;
  }
}

/**
 * Update existing Stripe product metadata (name, description, images)
 */
export async function updateStripeProductMetadata(product: any): Promise<void> {
  const stripeClient = getStripeClient();
  if (!stripeClient || !product.SKU) {
    return;
  }

  try {
    console.log('[STRIPE_PRODUCT_SERVICE] Retrieving existing Stripe product for comparison...');
    const existingProduct = await stripeClient.products.retrieve(product.SKU);

    const updateData: Stripe.ProductUpdateParams = {};
    let needsUpdate = false;

    // Check if name changed
    if (product.Name && product.Name !== existingProduct.name) {
      updateData.name = product.Name;
      needsUpdate = true;
      console.log('[STRIPE_PRODUCT_SERVICE] Product name changed:', {
        old: existingProduct.name,
        new: product.Name
      });
    }

    const newDescription = product.Description ? stripsMarkdown(product.Description) : '';
    const oldDescription = existingProduct.description || '';

    if (newDescription !== oldDescription) {
      updateData.description = newDescription || undefined;
      needsUpdate = true;
      console.log('[markket.stripe]:product.description.truncated');
    }

    const newImages: string[] = [];
    if (product.Thumbnail?.url) {
      newImages.push(getFullImageUrl(product.Thumbnail.url));
    } else if (product.Slides && product.Slides.length > 0) {
      const slideImages = product.Slides
        .filter((slide: any) => slide.url)
        .slice(0, 8)
        .map((slide: any) => getFullImageUrl(slide.url));
      newImages.push(...slideImages);
    } else {
      console.warn('[STRIPE_PRODUCT_SERVICE] No Thumbnail or Slides found for product images. Skipping image update.');
    }

    const existingImages = existingProduct.images || [];
    const imagesChanged = JSON.stringify(newImages.sort()) !== JSON.stringify(existingImages.sort());

    if (imagesChanged && newImages.length > 0) {
      updateData.images = newImages;
      needsUpdate = true;
      console.log('[STRIPE_PRODUCT_SERVICE] Product images changed:', {
        oldCount: existingImages.length,
        newCount: newImages.length
      });
    }

    // Update metadata
    updateData.metadata = {
      ...existingProduct.metadata,
      strapiId: product.documentId || product.id || '',
      slug: product.slug || '',
      lastSyncedAt: new Date().toISOString(),
    };

    if (needsUpdate) {
      console.log('[STRIPE_PRODUCT_SERVICE] Updating Stripe product with new metadata...');
      const updatedProduct = await stripeClient.products.update(product.SKU, updateData);
      console.log('[STRIPE_PRODUCT_SERVICE] Stripe product updated successfully:', {
        id: updatedProduct.id,
        name: updatedProduct.name
      });
    } else {
      console.log('[STRIPE_PRODUCT_SERVICE] No product metadata changes detected, skipping update');
    }

  } catch (error) {
    console.error('[STRIPE_PRODUCT_SERVICE] Failed to update Stripe product metadata:', error);
  }
}
