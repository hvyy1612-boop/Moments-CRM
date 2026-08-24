import type { ReactNode } from 'react'

export function BoardGroup({
  title,
  count,
  spine,
  head,
  children,
}: {
  title: string
  count: number

  spine: string
  head: string[]
  children: ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-center gap-2 text-base font-bold text-ink">
        <span className="text-muted">▾</span>
        {title}
        <span className="font-normal text-muted">· {count}</span>
      </div>
      <div className={`overflow-x-auto rounded-md border border-line border-l-4 ${spine}`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-sunk text-left text-xs uppercase tracking-wide text-muted">
              {head.map((label) => (
                <th
                  key={label}
                  className="border-b border-r border-line px-3 py-3 font-bold last:border-r-0"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}
