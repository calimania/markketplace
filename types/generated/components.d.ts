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

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'common.links': CommonLinks;
    }
  }
}
