'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The staff nav, split out as a client component so the current section reads as active. A link
 * that looks the same whether or not you are on it leaves you unsure where you are.
 */
export function StaffNavLinks({ canSeeEnquiries }: { canSeeEnquiries: boolean }) {
  const pathname = usePathname()

  const items = [
    { href: '/dashboard', label: 'Dashboard' },
    ...(canSeeEnquiries
      ? [
          { href: '/enquiries', label: 'Enquiries' },
          { href: '/bookings', label: 'Bookings' },
        ]
      : []),
    { href: '/outbox', label: 'Outbox' },
  ]

  return (
    <nav className="flex gap-4 text-sm">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'font-medium text-ink'
                : 'text-ink-muted transition-colors duration-150 hover:text-ink'
            }
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
