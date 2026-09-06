'use client'

import Link from 'next/link'
import { useState } from 'react'
import { StageControl } from './StageControl'
import { ProgressControl, type ProgressTask } from './ProgressControl'
import { EnquiryRowMenu } from './EnquiryRowMenu'
import { EditEnquiryPreview } from './EditEnquiryPreview'

export type EnquiryRowData = {
  id: string
  name: string
  event: string
  status: string
  waitingOn: string | null
  shootDate: string | null
  email: string
  phone: string | null
  convertedProjectId: string | null
  tasks: ProgressTask[]
  waitingMs: number
  createdMs: number
}

/** Initials for the avatar chip, e.g. "Ha Vy Tran" -> "HT". Mirrors the Clients list. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function waitingLabel(waitingOn: string | null): string {
  if (waitingOn === 'STUDIO') return 'Studio'
  if (waitingOn === 'CLIENT') return 'Client'
  return 'No one'
}

export function EnquiryRow({ row }: { row: EnquiryRowData }) {
  const [editing, setEditing] = useState(false)

  return (
    <tr className="group border-b border-line align-middle transition-colors last:border-b-0 hover:bg-paper">
      <td className="py-3 pr-4">
        <Link href={`/enquiries/${row.id}`} className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">
            {initials(row.name)}
          </span>
          <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{row.name}</span>
        </Link>
      </td>
      <td className="py-3 pr-4 text-ink-muted">{row.event}</td>
      <td className="py-3 pr-4">
        <StageControl status={row.status} />
      </td>
      <td className="py-3 pr-4 text-ink-muted">{waitingLabel(row.waitingOn)}</td>
      <td className="py-3 pr-4">
        <ProgressControl tasks={row.tasks} />
      </td>
      <td className="tabular py-3 pr-4 text-ink-muted">{row.shootDate ?? 'Not set'}</td>
      <td className="py-3 text-right">
        <EnquiryRowMenu
          enquiryId={row.id}
          convertedProjectId={row.convertedProjectId}
          onEditDetails={() => setEditing(true)}
        />
        {editing ? (
          <EditEnquiryPreview
            fields={{
              name: row.name,
              email: row.email,
              phone: row.phone ?? '',
              event: row.event,
              shootDate: row.shootDate ?? '',
            }}
            onClose={() => setEditing(false)}
          />
        ) : null}
      </td>
    </tr>
  )
}
