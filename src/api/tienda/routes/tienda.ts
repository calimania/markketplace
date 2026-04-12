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
  ],
};
