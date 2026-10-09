#!/usr/bin/env node
// Fail the build if any source file reads a browser-only global without `window.` (scripts/browser-globals.mjs).
// It type-checks, so tsc cannot catch it, and `next build` skips ESLint - this runs before every Vercel build
// (vercel.json buildCommand) so such a page can never go live.
//
// Reports every offending file:line, not just a non-zero exit (DECISIONS.md D-007).
import { ESLint } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import { BROWSER_GLOBALS } from './browser-globals.mjs'

const eslint = new ESLint({
  overrideConfigFile: true,
  // Only this one rule runs, so the source's eslint-disable comments for other rules must not be read.
  allowInlineConfig: false,
  overrideConfig: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: { 'no-restricted-globals': ['error', ...BROWSER_GLOBALS] },
    },
  ],
})

const results = await eslint.lintFiles(['src/**/*.ts', 'src/**/*.tsx'])
const violations = results.flatMap((r) =>
  r.messages.map((m) => `${r.filePath.replace(`${process.cwd()}/`, '')}:${m.line}  ${m.message}`),
)

if (violations.length > 0) {
  console.error(`Browser-only global used without window. (crashes on the server):\n${violations.join('\n')}`)
  process.exit(1)
}
console.log(`check:globals OK - ${results.length} files, no bare browser globals.`)
