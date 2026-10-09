import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

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
      // Browser globals (window.status, window.name, ...) type-check everywhere because lib.dom declares
      // them, but they do not exist on the server: a stray `status` crashed /jobs whenever the list was empty.
      // Write window.x in client code when it is really meant.
      'no-restricted-globals': ['error', 'addEventListener', 'blur', 'close', 'closed', 'confirm', 'event', 'external', 'find', 'focus', 'frames', 'history', 'innerHeight', 'innerWidth', 'length', 'location', 'name', 'onerror', 'onload', 'open', 'opener', 'outerHeight', 'outerWidth', 'parent', 'print', 'removeEventListener', 'screen', 'scroll', 'scrollBy', 'scrollTo', 'scrollX', 'scrollY', 'self', 'status', 'stop', 'top'],
    },
  },
]

export default config
