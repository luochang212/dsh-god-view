import js from '@eslint/js';

const common = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  TextEncoder: 'readonly',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'site/node_modules/**',
      'site/dist/**',
      'site/.astro/**',
      'site/public/decisions/**',
      'screenshots/**',
      'adr/**',
      '.dsh/**',
      '.workbuddy/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: common },
    rules: { 'no-unused-vars': 'off', 'no-empty': 'off' },
  },
  {
    files: ['lib/client.js'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly' } },
  },
  {
    files: ['test/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
  },
];
