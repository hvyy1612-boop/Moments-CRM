'use client'

import { useState } from 'react'
import type { Selection } from './DataTable'

/**
 * Shared row-selection state for a `DataTable` with `selection` enabled. The parent owns the selected-id
 * set; this returns the `Selection` object the table needs plus the ids (for a batch action like Export)
 * and a `clear`. One hook so every list (Clients, Enquiries, Jobs, ...) selects the same way.
 */
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
