import type { ReactNode } from 'react'

export type PageVariant = 'narrow' | 'standard' | 'wide' | 'full'

const GUTTER = 'px-4 sm:px-6 lg:px-8'

const MEASURE: Record<PageVariant, string> = {
  narrow: 'mx-auto w-full max-w-page-narrow',
  standard: 'mx-auto w-full max-w-page-standard',
  wide: 'mx-auto w-full max-w-page-wide',
  full: 'w-full',
}

export function PageContainer({
  variant = 'standard',
  className,
  children,
}: {
  variant?: PageVariant

  className?: string
  children: ReactNode
}) {
  return <div className={`${GUTTER} ${MEASURE[variant]}${className ? ` ${className}` : ''}`}>{children}</div>
}
