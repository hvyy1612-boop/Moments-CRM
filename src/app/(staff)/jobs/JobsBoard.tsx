import Link from 'next/link'
import { PROJECT_STAGES, stageLabel } from '@/features/projects/workflow'
import { formatSydneyDate } from '@/lib/time'

export type BoardJob = {
  id: string
  client: string
  name: string
  stage: string // the job's current active stage key, or 'done'
  nextTask: string | null
  assignee: string
  shootDate: Date | null
}

const CORE = PROJECT_STAGES.filter((s) => !s.optional).map((s) => s.key)
const COLUMNS = [...CORE, 'done']
const OPTIONAL_TO_CORE: Record<string, string> = {
  preshoot: 'planning',
  video: 'editing',
  film: 'editing',
  album: 'editing',
}
/** Work-in-progress cap per column - warns when a lane holds too many at once. */
const WIP: Record<string, number> = { editing: 3 }

function columnFor(stage: string): string {
  if (stage === 'done') return 'done'
  if (CORE.includes(stage)) return stage
  return OPTIONAL_TO_CORE[stage] ?? 'editing'
}
function columnLabel(key: string): string {
  return key === 'done' ? 'Done' : stageLabel(key)
}

/**
 * A read-only board: swimlanes by the staff member a job is assigned to, columns by the job's current
 * stage. Cards move on their own as tasks are ticked (the active stage is derived), so there is no
 * dragging. A column with a WIP cap flags a lane that is carrying too many jobs at once.
 */
export function JobsBoard({ jobs }: { jobs: BoardJob[] }) {
  const lanes = Array.from(new Set(jobs.map((j) => j.assignee))).sort()
  if (lanes.length === 0) lanes.push('Unassigned')

  const grid: Record<string, Record<string, BoardJob[]>> = {}
  for (const lane of lanes) {
    grid[lane] = {}
    for (const c of COLUMNS) grid[lane][c] = []
  }
  for (const j of jobs) {
    const laneGrid = grid[j.assignee]
    if (laneGrid) laneGrid[columnFor(j.stage)]!.push(j)
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 border-b border-line pb-2">
        <div className="w-32 shrink-0" />
        {COLUMNS.map((c) => {
          const total = jobs.filter((j) => columnFor(j.stage) === c).length
          const cap = WIP[c]
          return (
            <div key={c} className="min-w-0 flex-1 px-1 text-xs font-bold uppercase tracking-wide text-muted">
              {columnLabel(c)}
              <span className="ml-1 font-normal">
                · {total}
                {cap ? `/${cap}` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {lanes.map((lane) => (
        <div key={lane} className="flex gap-2 border-b border-line py-2 last:border-b-0">
          <div className="w-32 shrink-0 pt-1 text-sm font-bold text-ink">{lane}</div>
          {COLUMNS.map((c) => {
            const cell = grid[lane]?.[c] ?? []
            const cap = WIP[c]
            const over = cap !== undefined && cell.length > cap
            return (
              <div key={c} className="min-w-0 flex-1 rounded-md bg-sunk p-1.5">
                {over ? (
                  <div className="mb-1 px-1 text-xs font-bold text-accent-ink">
                    {cell.length}/{cap} over
                  </div>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  {cell.map((j) => (
                    <Link
                      key={j.id}
                      href={`/jobs/${j.id}`}
                      className="block rounded border border-line bg-surface px-2.5 py-2 transition-colors hover:border-accent"
                    >
                      <div className="truncate font-serif text-sm font-semibold text-ink">{j.client}</div>
                      {j.shootDate ? (
                        <div className="tabular text-xs text-ink-muted">Shoot {formatSydneyDate(j.shootDate)}</div>
                      ) : null}
                      {j.nextTask ? <div className="truncate text-xs text-muted">{j.nextTask}</div> : null}
                    </Link>
                  ))}
                  {cell.length === 0 ? <div className="px-1 py-1 text-xs text-muted">-</div> : null}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
