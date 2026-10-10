import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import { BROWSER_GLOBALS } from './scripts/browser-globals.mjs'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',

      '.next-e2e/**',

      '.next-preview/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'scripts/**',
      'postcss.config.mjs',
      'eslint.config.mjs',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {

      '@typescript-eslint/no-explicit-any': 'error',

      'no-restricted-globals': ['error', ...BROWSER_GLOBALS],
    },
  },
]

export default config
