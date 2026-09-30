'use client'

import { useState } from 'react'
import type { Selection } from './DataTable'

export function useRowSelection<T>(): { selectedIds: string[]; selection: Selection<T>; clear: () => void } {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selection: Selection<T> = {
    isSelected: (id) => selected.has(id),
    onToggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    onToggleMany: (ids, on) =>
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of ids) {
          if (on) next.add(id)
          else next.delete(id)
        }
        return next
      }),
  }
  return { selectedIds: Array.from(selected), selection, clear: () => setSelected(new Set()) }
}
