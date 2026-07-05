/**
 * inbox router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/inbox',
      handler: 'inbox.listThreads',
    },
    {
      method: 'POST',
      path: '/inbox/thread/:threadKey/state',
      handler: 'inbox.updateThreadState',
    },
    {
      method: 'POST',
      path: '/inbox/outbound',
      handler: 'inbox.sendOutbound',
    },
    {
      method: 'POST',
      path: '/inbox/inbound',
      handler: 'inbox.processInbound',
    },
  ],
};
