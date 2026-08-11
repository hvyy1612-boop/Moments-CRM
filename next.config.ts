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
  eslint: {
    // The verify pipeline runs ESLint as its own dedicated step (§12.2), so `next build` does not
    // re-run it. This also avoids a flat-config plugin-detection warning during the build.
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
