import { mergeConfig } from 'vite';
import path from 'path';

export default (config) => {
  // Strapi's mergeConfig utility perfectly overrides the nested paths safely
  return mergeConfig(config, {
    resolve: {
      alias: {
        '@codemirror/state': path.resolve(__dirname, '../../node_modules/@codemirror/state'),
      },
    },
  });
};
