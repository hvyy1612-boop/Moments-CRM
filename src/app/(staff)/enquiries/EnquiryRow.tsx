'use client'

import { useState } from 'react'
import { EnquiryRowMenu } from './EnquiryRowMenu'
import { EditEnquiryPreview } from './EditEnquiryPreview'

export type EnquiryRowData = {
  id: string
  number: string | null
  name: string
  event: string
  status: string
  waitingOn: string | null
  shootDate: string | null
  email: string
  phone: string | null
  convertedProjectId: string | null
  waitingMs: number
  createdMs: number
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export function waitingLabel(waitingOn: string | null): string {
  if (waitingOn === 'STUDIO') return 'Studio'
  if (waitingOn === 'CLIENT') return 'Client'
  return 'No one'
}

export function EnquiryActionsCell({ row, csrf }: { row: EnquiryRowData; csrf: string }) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <EnquiryRowMenu
        enquiryId={row.id}
        status={row.status}
        convertedProjectId={row.convertedProjectId}
        onEditDetails={() => setEditing(true)}
        csrf={csrf}
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
    </>
  )
}
