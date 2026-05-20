const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      '.venv/**',
      'legacy/**',
      'node_modules/**',
      'ops/nginx/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
