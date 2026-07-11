import { mergeConfig } from 'vite';

export default (config) => {
  // Force a single instance of CodeMirror/Lezer packages across admin bundles.
  // Mixed instances break instanceof checks and trigger extension-set runtime errors.
  return mergeConfig(config, {
    resolve: {
      dedupe: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/search',
        '@codemirror/autocomplete',
        '@codemirror/lint',
        '@codemirror/lang-markdown',
        '@lezer/common',
        '@lezer/highlight',
        'style-mod',
      ],
    },
  });
};
