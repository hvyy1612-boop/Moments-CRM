import type { NextConfig } from 'next'

/**
 * Base Next.js configuration.
 *
 * Strict security headers (SEC-A05: CSP with no unsafe-inline, HSTS, X-Frame-Options DENY,
 * X-Content-Type-Options, Referrer-Policy, Permissions-Policy) are applied via middleware from
 * Slice 1/2, where a per-request CSP nonce is available. Kept minimal here on purpose.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @react-pdf/renderer ships font/layout internals (fontkit, yoga wasm) that must not be bundled by
  // the server compiler; load it from node_modules at runtime so the quote-PDF route builds cleanly.
  serverExternalPackages: ['@react-pdf/renderer'],
  // The e2e suite builds for production while `npm run dev` may be running. Sharing .next means
  // the build overwrites the chunks the dev server is serving and both break, so the suite gets
  // its own output directory via NEXT_DIST_DIR (playwright.config.ts sets it).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  eslint: {
    // The verify pipeline runs ESLint as its own dedicated step (§12.2), so `next build` does not
    // re-run it. This also avoids a flat-config plugin-detection warning during the build.
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
