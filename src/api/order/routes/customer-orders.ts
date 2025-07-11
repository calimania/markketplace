
export default  {
  routes: [
    {
      method: 'GET',
      path: '/orders/mine',
      handler: 'order.customerOrders',
    },
  ],
};
