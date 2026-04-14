/**
 * Media target registry for tienda uploads.
 * Source of truth for attachable content types/fields and media constraints.
 */

export type MediaFieldMode = 'single' | 'multiple';

export interface MediaFieldConfig {
  mode: MediaFieldMode;
  allowedTypes: string[];
}

export interface MediaTargetConfig {
  uid: string;
  fields: Record<string, MediaFieldConfig>;
}

export const MEDIA_TARGETS: Record<string, MediaTargetConfig> = {
  store: {
    uid: 'api::store.store',
    fields: {
      Logo: { mode: 'single', allowedTypes: ['images', 'files', 'videos', 'audios'] },
      Cover: { mode: 'single', allowedTypes: ['images'] },
      Slides: { mode: 'multiple', allowedTypes: ['images', 'files', 'videos', 'audios'] },
      Favicon: { mode: 'single', allowedTypes: ['images', 'files', 'videos', 'audios'] },
    },
  },
  article: {
    uid: 'api::article.article',
    fields: {
      cover: { mode: 'single', allowedTypes: ['images'] },
    },
  },
  album: {
    uid: 'api::album.album',
    fields: {
      cover: { mode: 'single', allowedTypes: ['images'] },
    },
  },
  track: {
    uid: 'api::album.track',
    fields: {
      media: { mode: 'single', allowedTypes: ['images', 'files', 'videos', 'audios'] },
    },
  },
  product: {
    uid: 'api::product.product',
    fields: {
      Thumbnail: { mode: 'single', allowedTypes: ['images'] },
      Slides: { mode: 'multiple', allowedTypes: ['images'] },
    },
  },
  event: {
    uid: 'api::event.event',
    fields: {
      Thumbnail: { mode: 'single', allowedTypes: ['images'] },
      Slides: { mode: 'multiple', allowedTypes: ['images'] },
    },
  },
  shortner: {
    uid: 'api::shortner.shortner',
    fields: {
      image: { mode: 'single', allowedTypes: ['images'] },
    },
  },
};

export function getMediaFieldConfig(contentType: string, field: string): MediaFieldConfig | null {
  const target = MEDIA_TARGETS[contentType];
  if (!target) {
    return null;
  }

  return target.fields[field] || null;
}

export function getMediaTargetConfig(contentType: string): MediaTargetConfig | null {
  return MEDIA_TARGETS[contentType] || null;
}

export function getMediaTargetsForClient() {
  return Object.entries(MEDIA_TARGETS).map(([contentType, config]) => ({
    contentType,
    uid: config.uid,
    fields: Object.entries(config.fields).map(([field, fieldConfig]) => ({
      field,
      mode: fieldConfig.mode,
      allowedTypes: fieldConfig.allowedTypes,
    })),
  }));
}
