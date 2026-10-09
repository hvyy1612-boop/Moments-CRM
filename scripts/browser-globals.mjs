// Names that exist only in the browser (window.status, window.name, ...). TypeScript accepts them anywhere
// because lib.dom declares them, but a server page that reads one crashes with "x is not defined" - a stray
// `status` took /jobs down whenever the list was empty. Shared by eslint.config.mjs (lint) and
// check-browser-globals.mjs (run before every Vercel build). Client code writes window.x when it means it.
export const BROWSER_GLOBALS = [
  'addEventListener', 'blur', 'close', 'closed', 'confirm', 'event', 'external', 'find', 'focus', 'frames',
  'history', 'innerHeight', 'innerWidth', 'length', 'location', 'name', 'onerror', 'onload', 'open', 'opener',
  'outerHeight', 'outerWidth', 'parent', 'print', 'removeEventListener', 'screen', 'scroll', 'scrollBy',
  'scrollTo', 'scrollX', 'scrollY', 'self', 'status', 'stop', 'top',
]
