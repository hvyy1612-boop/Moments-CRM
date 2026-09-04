'use client'

import { useActionState } from 'react'
import { resetStaffPasswordAction, setStaffActiveAction, type ResetState } from './actions'

export type StaffRowData = {
  id: string
  name: string
  loginId: string
  roleLabel: string
  isActive: boolean
  lastLogin: string
}

const RESET_INITIAL: ResetState = { status: 'idle' }

function StaffRow({ staff, csrf, isSelf }: { staff: StaffRowData; csrf: string; isSelf: boolean }) {
  const [reset, resetAction, resetting] = useActionState(resetStaffPasswordAction, RESET_INITIAL)

  return (
    <div className="border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-base text-ink">{staff.name}</span>
          {isSelf ? <span className="ml-2 text-xs text-ink-muted">(you)</span> : null}
          {!staff.isActive ? (
            <span className="ml-2 rounded bg-lost px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-lost-ink">Disabled</span>
          ) : null}
          <div className="tabular text-sm text-ink-muted">{staff.loginId}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-line-strong px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            {staff.roleLabel}
          </span>
          <span className="tabular text-sm text-ink-muted">{staff.lastLogin}</span>
          <form action={resetAction}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="userId" value={staff.id} />
            <button
              type="submit"
              disabled={resetting}
              className="rounded border border-line-strong px-2.5 py-1 text-sm font-medium text-ink outline-none transition-colors duration-150 hover:bg-sunk focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            >
              {resetting ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
          {!isSelf ? (
            <form action={setStaffActiveAction}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="userId" value={staff.id} />
              <input type="hidden" name="active" value={staff.isActive ? 'false' : 'true'} />
              <button
                type="submit"
                className="rounded border border-line-strong px-2.5 py-1 text-sm font-medium outline-none transition-colors duration-150 hover:bg-sunk focus-visible:ring-2 focus-visible:ring-accent"
                style={{ color: staff.isActive ? 'var(--color-lost-ink)' : 'var(--color-ink)' }}
              >
                {staff.isActive ? 'Disable' : 'Enable'}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {reset.status === 'reset' ? (
        <div className="mt-2 rounded-md border border-line bg-delivered p-3 text-sm">
          <span className="font-bold text-delivered-ink">New temporary password</span> — give it to {staff.name}; they’ll change it on next sign-in:
          <span className="ml-2 select-all rounded border border-line bg-surface px-2 py-0.5 text-ink">{reset.tempPassword}</span>
        </div>
      ) : null}
      {reset.status === 'error' ? <div className="mt-2 text-sm text-danger">{reset.message}</div> : null}
    </div>
  )
}

export function StaffList({ staff, csrf, currentUserId }: { staff: StaffRowData[]; csrf: string; currentUserId: string }) {
  return (
    <div className="flex flex-col">
      {staff.map((s) => (
        <StaffRow key={s.id} staff={s} csrf={csrf} isSelf={s.id === currentUserId} />
      ))}
    </div>
  )
}
