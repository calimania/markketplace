

import user from './content-types/user';

export default (plugin: { contentTypes: any }) => {

  plugin.contentTypes.user = user;

  return plugin;
};
