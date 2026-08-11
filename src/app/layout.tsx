import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

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
