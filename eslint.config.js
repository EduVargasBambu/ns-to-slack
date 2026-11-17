const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      'node_modules/',
      'coverage/',
      'src/FileCabinet/SuiteScripts/gpv_payment_authorization/ui/',
    ],
  },
  js.configs.recommended,
  {
    // SuiteScript 2.1 (AMD modules on the NetSuite server)
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { define: 'readonly' },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['__tests__/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.jest, ...globals.node },
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  prettier,
];
