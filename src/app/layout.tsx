import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Cormorant_Garamond, Lato } from 'next/font/google'
import './globals.css'

// Brand fonts (D-05), self-hosted by next/font: files are downloaded at build and served from our
// own domain, so the browser never calls Google and the strict CSP (font-src 'self') is satisfied.
// Each exposes a CSS variable that globals.css maps to --font-serif / --font-sans.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-cormorant',
  display: 'swap',
})
const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-lato',
  display: 'swap',
})

// Every page renders per request so the per-request CSP nonce applies to every script tag
// (SEC-A05: strict CSP, no unsafe-inline). A statically prerendered page cannot carry a nonce,
// which would force 'unsafe-inline'; giving up static optimisation is the cheaper concession for
// a studio of this size (D-023).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Moments — Client Management',
  description: 'Client management system for Moments Photography and Film.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" className={`${lato.variable} ${cormorant.variable}`}>
      <body>{children}</body>
    </html>
  )
}
