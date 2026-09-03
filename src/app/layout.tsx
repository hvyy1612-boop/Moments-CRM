import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Poppins, Bodoni_Moda } from 'next/font/google'
import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-bodoni',
  display: 'swap',
})

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Moments - Client Management',
  description: 'Client management system for Moments Photography and Film.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" className={`${poppins.variable} ${bodoni.variable}`}>
      <body>{children}</body>
    </html>
  )
}
