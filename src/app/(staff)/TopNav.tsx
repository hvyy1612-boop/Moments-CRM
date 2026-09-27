'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { CommandPalette } from '@/components/CommandPalette'
import { NotificationBell } from '@/components/NotificationBell'
import type { Alert } from '@/lib/domain/alerts'
import { signOut } from './actions'

export function TopNav({
  collapsed,
  onToggle,
  initial,
  userName,
  userRole,
  csrf,
  alerts,
}: {
  collapsed: boolean
  onToggle: () => void
  initial: string
  userName: string
  userRole: string
  csrf: string
  alerts: Alert[]
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center bg-paper pl-2 pr-3 sm:pr-5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="flex h-9 shrink-0 items-center justify-center rounded-md px-3 text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <Link href="/dashboard" aria-label="Moments home" className="flex shrink-0 items-center">
        <Image src="/landing/wordmark.png" alt="Moments" width={655} height={148} priority className="h-6 w-auto sm:h-7" />
      </Link>

      <div className="flex min-w-0 flex-1 justify-center px-3 sm:px-6">
        <div className="w-full max-w-xl">
          <CommandPalette />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <NotificationBell alerts={alerts} />

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-tint text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
        >
          {initial}
        </button>
        {menuOpen ? (
          <div role="menu" className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
            <div className="border-b border-line px-4 py-3">
              <div className="truncate text-sm font-medium text-ink">{userName}</div>
              <div className="truncate text-xs capitalize text-ink-muted">{userRole.toLowerCase()}</div>
            </div>
            <div className="py-1">
              <Link href="/settings" role="menuitem" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-ink hover:bg-paper">
                Settings
              </Link>
              <form action={signOut}>
                <input type="hidden" name="csrf" value={csrf} />
                <button type="submit" role="menuitem" className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-paper">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
      </div>
    </header>
  )
}
