'use client'

import { Button } from '@/components/ui/Button'
import { deleteClientAction } from '../actions'

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

/** Permanent delete with a confirm step (ADMIN only). Cascades the client and all their history. */
export function DeleteClientButton({ clientId, name, csrf }: { clientId: string; name: string; csrf: string }) {
  return (
    <form
      action={deleteClientAction}
      onSubmit={(e) => {
        if (!window.confirm(`Permanently delete ${name} and ALL their jobs, quotes, invoices and history? This cannot be undone.`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="clientId" value={clientId} />
      <Button variant="secondary" size="sm" type="submit" className="text-ink-muted hover:text-danger">
        <IconTrash /> Delete client
      </Button>
    </form>
  )
}
