'use client'

import { Button } from '@/components/ui/Button'
import { removeClientAction } from '../actions'

function IconTrash() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" />
    </svg>
  )
}

/**
 * Remove a client, with a confirm step. No hard cascade: an empty client is deleted for good, while a
 * client with jobs or enquiries is archived instead (reversible), so their financial history is never
 * destroyed. Archiving a client with history is ADMIN-only (enforced server-side).
 */
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
      <Button variant="secondary" size="sm" type="submit" className="text-ink-muted hover:text-danger">
        <IconTrash /> Remove client
      </Button>
    </form>
  )
}
