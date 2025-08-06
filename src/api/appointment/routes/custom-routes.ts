/**
 * Custom appointment routes - Search functionality
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/appointments/search-by-customer',
      handler: 'appointment.searchByCustomer',
      config: {
        policies: [],
      },
    },
  ],
};
