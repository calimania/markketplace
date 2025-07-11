import type { Schema, Struct } from '@strapi/strapi';

export interface CommonAddress extends Struct.ComponentSchema {
  collectionName: 'components_common_address';
  info: {
    description: '';
    displayName: 'Address';
    icon: 'earth';
  };
  attributes: {
    city: Schema.Attribute.String;
    country: Schema.Attribute.String;
    email: Schema.Attribute.String;
    name: Schema.Attribute.String;
    state: Schema.Attribute.String;
    street: Schema.Attribute.String;
    street_2: Schema.Attribute.String;
    zipcode: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 10;
        minLength: 5;
      }>;
  };
}

export interface CommonPaymentAttempts extends Struct.ComponentSchema {
  collectionName: 'components_common_payment_attempts';
  info: {
    displayName: 'Payment_attempts';
    icon: 'scissors';
  };
  attributes: {
    buyer_email: Schema.Attribute.String;
    reason: Schema.Attribute.String;
    Status: Schema.Attribute.Enumeration<
      [
        'Succeeded',
        'Incomplete',
        'Failed',
        'Uncaptured',
        'Canceled',
        'Refunded',
      ]
    >;
    Timestampt: Schema.Attribute.DateTime;
  };
}

export interface CommonPrices extends Struct.ComponentSchema {
  collectionName: 'components_common_prices';
  info: {
    description: '';
    displayName: 'Prices';
    icon: 'music';
  };
  attributes: {
    Currency: Schema.Attribute.String;
    Description: Schema.Attribute.Text;
    Name: Schema.Attribute.String;
    Price: Schema.Attribute.Decimal;
    STRIPE_ID: Schema.Attribute.String;
  };
}

export interface CommonProductSnapshop extends Struct.ComponentSchema {
  collectionName: 'components_common_product_snapshops';
  info: {
    displayName: 'PRODUCT_SNAPSHOP';
    icon: 'clock';
  };
  attributes: {
    Name: Schema.Attribute.String;
    Price: Schema.Attribute.Decimal;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    Quantity: Schema.Attribute.Integer;
    Short_description: Schema.Attribute.String;
  };
}

export interface CommonSeo extends Struct.ComponentSchema {
  collectionName: 'components_common_seos';
  info: {
    description: '';
    displayName: 'SEO';
    icon: 'restaurant';
  };
  attributes: {
    excludeFromSearch: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    metaAuthor: Schema.Attribute.String;
    metaDate: Schema.Attribute.DateTime;
    metaDescription: Schema.Attribute.String;
    metaKeywords: Schema.Attribute.String;
    metaTitle: Schema.Attribute.String;
    metaUrl: Schema.Attribute.String;
    socialImage: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
  };
}

export interface CommonTag extends Struct.ComponentSchema {
  collectionName: 'components_common_tags';
  info: {
    displayName: 'Tag';
    icon: 'book';
  };
  attributes: {
    Color: Schema.Attribute.Enumeration<
      [
        'Tangerine',
        'Royal Blue',
        'Magenta',
        'Sunset Orange',
        'Amber',
        'Sky Blue',
        'Fuchsia',
        'Burnt Sienna',
        'Gold',
        'Ocean Blue',
        'Hot Pink',
        'Teal',
        'Coral',
        'Purple',
        'Spring Green',
        'Goldenrod',
        'Indigo',
        'Pink',
        'Blue Violet',
        'Firebrick',
      ]
    > &
      Schema.Attribute.DefaultTo<'Magenta'>;
    Label: Schema.Attribute.String;
  };
}

export interface CommonUrls extends Struct.ComponentSchema {
  collectionName: 'components_common_urls';
  info: {
    description: '';
    displayName: 'URLS';
    icon: 'scissors';
  };
  attributes: {
    Label: Schema.Attribute.String;
    URL: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'common.address': CommonAddress;
      'common.payment-attempts': CommonPaymentAttempts;
      'common.prices': CommonPrices;
      'common.product-snapshop': CommonProductSnapshop;
      'common.seo': CommonSeo;
      'common.tag': CommonTag;
      'common.urls': CommonUrls;
    }
  }
}
