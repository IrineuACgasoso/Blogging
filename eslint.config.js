// ESLint (formato "flat"). Rode: npm run lint
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', '**/node_modules/**', 'tests/.env.test'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Regras de segurança para TODO o código: nada de eval / código montado em texto / javascript: URL.
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  // Em testes, `any` é aceitável para montar dados falsos (mocks). No código de produção a regra continua rígida.
  { files: ['tests/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  {
    files: ['api/**/*.ts', 'lib/**/*.ts', 'scripts/**/*.mjs', 'tests/**/*.{mjs,ts,tsx}', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
