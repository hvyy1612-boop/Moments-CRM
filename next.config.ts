import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  serverExternalPackages: ['@react-pdf/renderer'],

  outputFileTracingIncludes: {
    '/quote/[token]': ['./node_modules/pdfkit/**/*', './node_modules/@react-pdf/**/*', './node_modules/fontkit/**/*'],
  },

  distDir: process.env.NEXT_DIST_DIR ?? '.next',

  async redirects() {
    return [
      { source: '/enquiries', destination: '/leads', permanent: true },
      { source: '/enquiries/:path*', destination: '/leads/:path*', permanent: true },
    ]
  },
  eslint: {
    // The verify pipeline runs ESLint as its own dedicated step (§12.2), so `next build` does not

    ignoreDuringBuilds: true,
  },
}

export default nextConfig
