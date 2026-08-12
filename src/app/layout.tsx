import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

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
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  )
}
