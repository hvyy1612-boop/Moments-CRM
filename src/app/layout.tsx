import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Poppins } from 'next/font/google'
import './globals.css'

// Single UI font (self-hosted by next/font so the browser never calls Google and the strict CSP
// font-src 'self' is satisfied). One clean, readable geometric sans across the whole app - headings
// and body - for a modern, easy-to-read look. Exposed as --font-poppins; globals.css maps both
// --font-sans and --font-serif to it.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

// Every page renders per request so the per-request CSP nonce applies to every script tag
// (SEC-A05: strict CSP, no unsafe-inline). A statically prerendered page cannot carry a nonce,
// which would force 'unsafe-inline'; giving up static optimisation is the cheaper concession for
// a studio of this size (D-023).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Moments - Client Management',
  description: 'Client management system for Moments Photography and Film.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" className={poppins.variable}>
      <body>{children}</body>
    </html>
  )
}
