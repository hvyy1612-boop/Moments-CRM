import type { ReactNode } from 'react'

export function MainAside({
  main,
  aside,
  className = '',
}: {
  main: ReactNode
  aside: ReactNode
  className?: string
}) {
  return (
    <div className={`grid grid-cols-1 items-start gap-x-8 gap-y-6 lg:grid-cols-12 ${className}`}>
      <div className="min-w-0 lg:col-span-8">{main}</div>
      <aside className="lg:col-span-4">{aside}</aside>
    </div>
  )
}
