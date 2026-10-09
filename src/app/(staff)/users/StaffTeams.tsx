'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { removeStaffAction, resetStaffPasswordAction, setStaffActiveAction, type ResetState } from './actions'

export type StaffRowData = {
  id: string
  name: string
  loginId: string
  roleLabel: string
  isActive: boolean
  lastLogin: string
}

export type TeamGroup = {
  slug: string
  label: string
  activeCount: number
  members: StaffRowData[]
}

const RESET_INITIAL: ResetState = { status: 'idle' }

const btn =
  'rounded border border-line-strong px-2.5 py-1 text-sm font-medium outline-none transition-colors duration-150 hover:bg-sunk focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60'

function StaffRow({ staff, csrf, isSelf }: { staff: StaffRowData; csrf: string; isSelf: boolean }) {
  const [reset, resetAction, resetting] = useActionState(resetStaffPasswordAction, RESET_INITIAL)

  return (
    <div className={`border-t border-line py-3 first:border-t-0 ${staff.isActive ? '' : 'opacity-70'}`}>
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
          <span className="tabular text-sm text-ink-muted">{staff.lastLogin}</span>
          {/* Your own password is changed via Change password: resetting it here would sign you out. */}
          {!isSelf ? (
            <form action={resetAction}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="userId" value={staff.id} />
              <button type="submit" disabled={resetting} className={btn}>
                {resetting ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          ) : (
            <a href="/change-password" className={btn}>Change password</a>
          )}
          {!isSelf ? (
            <form action={setStaffActiveAction}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="userId" value={staff.id} />
              <input type="hidden" name="active" value={staff.isActive ? 'false' : 'true'} />
              <button type="submit" className={btn} style={{ color: staff.isActive ? 'var(--color-lost-ink)' : 'var(--color-ink)' }}>
                {staff.isActive ? 'Disable' : 'Enable'}
              </button>
            </form>
          ) : null}
          {!isSelf ? (
            <form
              action={removeStaffAction}
              onSubmit={(e) => {
                if (!window.confirm(`Remove ${staff.name}? They will lose access immediately and be taken off the team list.`)) {
                  e.preventDefault()
                }
              }}
            >
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="userId" value={staff.id} />
              <button type="submit" className={`${btn} text-danger`}>Remove</button>
            </form>
          ) : null}
        </div>
      </div>

      {reset.status === 'reset' ? (
        <div className="mt-2 rounded-md border border-line bg-delivered p-3 text-sm">
          <span className="font-bold text-delivered-ink">New temporary password</span>. Give it to {staff.name}; they’ll change it on next sign-in:
          <span className="ml-2 select-all rounded border border-line bg-surface px-2 py-0.5 text-ink">{reset.tempPassword}</span>
        </div>
      ) : null}
      {reset.status === 'error' ? <div className="mt-2 text-sm text-danger">{reset.message}</div> : null}
    </div>
  )
}

export function StaffTeams({ teams, csrf, currentUserId }: { teams: TeamGroup[]; csrf: string; currentUserId: string }) {
  if (teams.length === 0) {
    return <p className="text-sm text-ink-muted">No staff yet. Add your first account above.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {teams.map((team) => (
        <section key={team.slug} className="rounded-md border border-line bg-surface p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
              {team.label} <span className="text-ink-muted">· {team.activeCount} active</span>
            </h2>
            <Link
              href={`/users/roster/${team.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded border border-line-strong px-2.5 py-1 text-sm font-medium text-ink outline-none transition-colors duration-150 hover:bg-sunk focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Download PDF
            </Link>
          </div>
          {team.members.map((s) => (
            <StaffRow key={s.id} staff={s} csrf={csrf} isSelf={s.id === currentUserId} />
          ))}
        </section>
      ))}
    </div>
  )
}
