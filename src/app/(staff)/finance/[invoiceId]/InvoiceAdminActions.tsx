'use client'

import { Button } from '@/components/ui/Button'
import { deleteInvoiceAction, voidInvoiceAction } from '../../jobs/actions'

export function InvoiceAdminActions({
  csrf,
  invoiceId,
  projectId,
  canVoid,
  canDelete,
}: {
  csrf: string
  invoiceId: string
  projectId: string
  canVoid: boolean
  canDelete: boolean
}) {
  return (
    <>
      {canVoid ? (
        <form action={voidInvoiceAction} onSubmit={(e) => { if (!window.confirm('Void this invoice? It stays on record but is marked void.')) e.preventDefault() }}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="submit" variant="secondary" size="sm">Void</Button>
        </form>
      ) : null}
      {canDelete ? (
        <form action={deleteInvoiceAction} onSubmit={(e) => { if (!window.confirm('Delete this invoice permanently? This cannot be undone.')) e.preventDefault() }}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="back" value="/finance" />
          <Button type="submit" variant="secondary" size="sm" className="text-ink-muted hover:text-danger">Delete</Button>
        </form>
      ) : null}
    </>
  )
}
