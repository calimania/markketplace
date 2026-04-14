/**
 * Tienda custom routes
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/tienda/me',
      handler: 'tienda.me',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/tienda/stores',
      handler: 'tienda.stores',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/tienda/stores',
      handler: 'tienda.createStore',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/tienda/stores/:ref',
      handler: 'tienda.store',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/tienda/stores/:ref',
      handler: 'tienda.updateStore',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/tienda/stores/:ref/settings',
      handler: 'tienda.storeSettings',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/tienda/stores/:ref/settings',
      handler: 'tienda.updateStoreSettings',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/tienda/tendero/:ref',
      handler: 'tienda.tendero',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/tienda/stores/:ref/content/:contentType',
      handler: 'tienda.listContent',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/tienda/stores/:ref/content/:contentType',
      handler: 'tienda.createContent',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/tienda/stores/:ref/content/:contentType/:itemId',
      handler: 'tienda.getContent',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/tienda/stores/:ref/content/:contentType/:itemId',
      handler: 'tienda.updateContent',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/tienda/stores/:ref/content/:contentType/:itemId',
      handler: 'tienda.deleteContent',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/tienda/stores/:ref/upload',
      handler: 'tienda.uploadStoreMedia',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/tienda/stores/:ref/media-targets',
      handler: 'tienda.mediaTargets',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
