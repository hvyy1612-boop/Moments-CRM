import type { ReactNode } from 'react'

/**
 * Minimal layout for the staff landing at "/". No marketing chrome — this is the entry to an internal
 * tool, so it stays a single calm, centred column on the brand ground.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-paper">{children}</div>
}
