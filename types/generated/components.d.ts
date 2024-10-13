import type { Schema, Attribute } from '@strapi/strapi';

export interface CommonLinks extends Schema.Component {
  collectionName: 'components_common_links';
  info: {
    displayName: 'Address';
    icon: 'earth';
    description: '';
  };
  attributes: {
    street: Attribute.String;
    street_2: Attribute.String;
    city: Attribute.String;
    state: Attribute.Enumeration<
      [
        'Alabama',
        'Alaska',
        'Arizona',
        'Arkansas',
        'California',
        'Colorado',
        'Connecticut',
        'Delaware',
        'Florida',
        'Georgia',
        'Hawaii',
        'Idaho',
        'Illinois',
        'Indiana',
        'Iowa',
        'Kansas',
        'Kentucky',
        'Louisiana',
        'Maine',
        'Maryland',
        'Massachusetts',
        'Michigan',
        'Minnesota',
        'Mississippi',
        'Missouri',
        'Montana',
        'Nebraska',
        'Nevada',
        'New Hampshire',
        'New Jersey',
        'New Mexico',
        'New York',
        'North Carolina',
        'North Dakota',
        'Ohio',
        'Oklahoma',
        'Oregon',
        'Pennsylvania',
        'Rhode Island',
        'South Carolina',
        'South Dakota',
        'Tennessee',
        'Texas',
        'Utah',
        'Vermont',
        'Virginia',
        'Washington',
        'West Virginia',
        'Wisconsin',
        'Wyoming'
      ]
    >;
    zipcode: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 5;
        maxLength: 10;
      }>;
  };
}

export interface CommonPaymentAttempts extends Schema.Component {
  collectionName: 'components_common_payment_attempts';
  info: {
    displayName: 'Payment_attempts';
    icon: 'scissors';
  };
  attributes: {
    Timestampt: Attribute.DateTime;
    Status: Attribute.Enumeration<
      [
        'Succeeded',
        'Incomplete',
        'Failed',
        'Uncaptured',
        'Canceled',
        'Refunded'
      ]
    >;
    reason: Attribute.String;
  };
}

export interface CommonPrices extends Schema.Component {
  collectionName: 'components_common_prices';
  info: {
    displayName: 'Prices';
    icon: 'music';
    description: '';
  };
  attributes: {
    Name: Attribute.String;
    Price: Attribute.Decimal;
    STRIPE_ID: Attribute.String;
    Currency: Attribute.String;
  };
}

export interface CommonProductSnapshop extends Schema.Component {
  collectionName: 'components_common_product_snapshops';
  info: {
    displayName: 'PRODUCT_SNAPSHOP';
    icon: 'clock';
  };
  attributes: {
    Name: Attribute.String;
    product: Attribute.Relation<
      'common.product-snapshop',
      'oneToOne',
      'api::product.product'
    >;
    Quantity: Attribute.Integer;
    Price: Attribute.Decimal;
    Short_description: Attribute.String;
  };
}

export interface CommonSeo extends Schema.Component {
  collectionName: 'components_common_seos';
  info: {
    displayName: 'SEO';
    icon: 'restaurant';
    description: '';
  };
  attributes: {
    metaTitle: Attribute.String;
    metaDescription: Attribute.String;
    metaKeywords: Attribute.String;
    socialImage: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    metaUrl: Attribute.String;
    metaAuthor: Attribute.String;
    excludeFromSearch: Attribute.Boolean & Attribute.DefaultTo<false>;
    Cover: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
  };
}

export interface CommonTag extends Schema.Component {
  collectionName: 'components_common_tags';
  info: {
    displayName: 'Tag';
    icon: 'book';
  };
  attributes: {
    Label: Attribute.String;
    Color: Attribute.Enumeration<
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
        'Firebrick'
      ]
    > &
      Attribute.DefaultTo<'Magenta'>;
  };
}

export interface CommonUrls extends Schema.Component {
  collectionName: 'components_common_urls';
  info: {
    displayName: 'URLS';
    icon: 'scissors';
    description: '';
  };
  attributes: {
    Label: Attribute.String;
    URL: Attribute.String;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'common.links': CommonLinks;
      'common.payment-attempts': CommonPaymentAttempts;
      'common.prices': CommonPrices;
      'common.product-snapshop': CommonProductSnapshop;
      'common.seo': CommonSeo;
      'common.tag': CommonTag;
      'common.urls': CommonUrls;
    }
  }
}
