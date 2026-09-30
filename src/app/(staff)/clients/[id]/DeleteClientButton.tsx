'use client'

import { IconButton } from '@/components/ui/IconButton'
import { removeClientAction } from '../actions'

export function DeleteClientButton({ clientId, name, csrf }: { clientId: string; name: string; csrf: string }) {
  return (
    <form
      action={removeClientAction}
      onSubmit={(e) => {
        if (!window.confirm(`Remove ${name}? If they have no jobs or enquiries they are deleted for good; otherwise they are archived and you can restore them later.`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="clientId" value={clientId} />
      <IconButton
        type="submit"
        label="Remove client"
        tone="danger"
        icon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" />
          </svg>
        }
      />
    </form>
  )
}
