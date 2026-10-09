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
      // The e2e production build output (playwright.config.ts NEXT_DIST_DIR).
      '.next-e2e/**',
      // The local preview server's build output (.claude/launch.json NEXT_DIST_DIR).
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
      // The brief bans `any` outright (§12.1).
      '@typescript-eslint/no-explicit-any': 'error',
      // Browser-only globals crash a server page (scripts/browser-globals.mjs); write window.x in client code.
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS],
    },
  },
]

export default config
