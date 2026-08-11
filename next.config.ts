import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // The verify pipeline runs ESLint as its own dedicated step (§12.2), so `next build` does not

    ignoreDuringBuilds: true,
  },
}

export default nextConfig
