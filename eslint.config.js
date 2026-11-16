import babelParser from '@babel/eslint-parser';
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * ESLint checks what the TypeScript compiler does not: accessibility of the
 * markup (jsx-a11y) and the rules of React hooks.
 *
 * The parser is Babel's, not typescript-eslint's. typescript-eslint needs the
 * TypeScript 5/6 compiler API, and this project uses TypeScript 7, which does
 * not ship it. Types are checked by `npm run typecheck`; ESLint only needs to
 * read the syntax. Revisit when typescript-eslint supports TypeScript 7.
 */

const parser = (isTSX) => ({
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    babelOptions: { babelrc: false, configFile: false, parserOpts: { plugins: isTSX ? ['typescript', 'jsx'] : ['typescript'] } },
  },
});

export default [
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.es2023 } },
    rules: {
      // The compiler already reports these, and knows about types.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
    },
  },
  { files: ['**/*.ts'], languageOptions: parser(false) },
  { files: ['**/*.tsx'], languageOptions: parser(true) },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The app's own input components wrap native inputs; a label may contain one of them.
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either', depth: 3 }],
    },
  },
  {
    // Node-side files: build and test configuration.
    files: ['*.config.{js,ts}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
];
