'use client'

import type { ReactNode } from 'react'
import type { AddableTaskType, TaskType } from '@/features/enquiries/workflow'

const SVG = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ICON: Partial<Record<TaskType, ReactNode>> = {
  TODO: (
    <svg {...SVG} className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  EXTRA_SHOOT: (
    <svg {...SVG} className="h-5 w-5" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <path d="M12 10.5v5M9.5 13h5" />
    </svg>
  ),
  APPOINTMENT: (
    <svg {...SVG} className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M12 13v3l2 1" />
    </svg>
  ),
}

/** Title hint per type, so the empty title box says what kind of thing is being added. */
export const TASK_TITLE_PLACEHOLDER: Partial<Record<TaskType, string>> = {
  TODO: 'New task',
  EXTRA_SHOOT: 'e.g. Engagement shoot',
  APPOINTMENT: 'e.g. Consultation call',
}

/**
 * "What are you adding?" for a workflow's "+ Add task" (Studio Ninja's "Add a New Workflow Task" choices,
 * minus Automation until email automation exists). Submits the chosen type as `type`.
 */
export function TaskTypePicker({
  options,
  value,
  onChange,
}: {
  options: AddableTaskType[]
  value: TaskType
  onChange: (type: TaskType) => void
}) {
  return (
    <div role="radiogroup" aria-label="Task type" className={`grid grid-cols-1 gap-2 ${options.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {options.map((o) => {
        const checked = value === o.value
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded border bg-surface px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
              checked ? 'border-ink' : 'border-line hover:border-line-strong'
            }`}
          >
            <input type="radio" name="type" value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
            <span className={`mt-0.5 shrink-0 ${checked ? 'text-ink' : 'text-muted'}`}>{ICON[o.value]}</span>
            <span className="min-w-0">
              <span className={`block text-sm font-bold ${checked ? 'text-ink' : 'text-ink-muted'}`}>{o.label}</span>
              <span className="block text-xs text-muted">{o.detail}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
