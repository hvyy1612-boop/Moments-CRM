import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import './globals.css'

// The in-app UI uses the native system sans (see globals.css --font-sans/--font-serif) - no webfont
// download. Only the public landing masthead loads custom faces below.

// Landing masthead type (reference-matched, public page only): Cormorant Garamond for the welcome
// heading, Manrope for the subtitle, description and button. Self-hosted by next/font (CSP-safe).
// The MOMENTS wordmark itself is not a font - it is the reference artwork (public/landing/wordmark.png).
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-cormorant',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-manrope',
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
    <html lang="en-AU" className={`${cormorant.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  )
}
