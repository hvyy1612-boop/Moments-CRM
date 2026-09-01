'use client'

import { deleteClientAction } from '../actions'

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
      <button type="submit" className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-lost-ink hover:underline">
        Delete permanently
      </button>
    </form>
  )
}
