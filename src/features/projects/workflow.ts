/**
 * Project workflow, Studio-Ninja style and EDITABLE per project (contract docs/23 + Hybrid decision).
 *
 * The stage shape (Booking / Pre-shoot / Shoot / Editing / Delivery), their colours, and the derived
 * auto-checked business facts live in code - they describe how a photo job runs and are read from the
 * real records (never duplicated). The TASKS inside each stage are editable data (WorkItem rows): staff
 * add, rename, re-date, reorder, complete, or delete them per client. A new project is seeded with the
 * default suggested flow below, then the studio tailors it.
 */

export type ProjectFacts = {
  booked: boolean
  shootScheduled: boolean
  galleryPrepared: boolean
  gallerySent: boolean
}

type DerivedDef = { key: string; title: string; fact: keyof ProjectFacts; note?: string; showShootDate?: boolean }
type StageDef = { key: string; label: string; color: string; derived: DerivedDef[] }

/** The fixed stages of a photography job. Colours map to the app status palette. */
export const PROJECT_STAGES: StageDef[] = [
  {
    key: 'booking',
    label: 'Booking',
    color: 'booked',
    derived: [
      { key: 'booking_confirmed', title: 'Booking confirmed', fact: 'booked', note: 'Auto-checks when a quote is accepted, a contract is signed, or a deposit is paid.' },
    ],
  },
  { key: 'preshoot', label: 'Pre-shoot', color: 'enquiry', derived: [] },
  {
    key: 'shoot',
    label: 'Shoot',
    color: 'quote',
    derived: [{ key: 'main_shoot', title: 'Main shoot', fact: 'shootScheduled', showShootDate: true, note: 'From the scheduled booking.' }],
  },
  { key: 'editing', label: 'Editing', color: 'editing', derived: [] },
  {
    key: 'delivery',
    label: 'Delivery',
    color: 'delivered',
    derived: [
      { key: 'gallery_prepared', title: 'Prepare final gallery', fact: 'galleryPrepared' },
      { key: 'gallery_sent', title: 'Send gallery to client', fact: 'gallerySent' },
    ],
  },
]

export const PROJECT_STAGE_KEYS: ReadonlySet<string> = new Set(PROJECT_STAGES.map((s) => s.key))

export function stageLabel(key: string): string {
  return PROJECT_STAGES.find((s) => s.key === key)?.label ?? key
}

/** The default suggested flow a new project is seeded with. dueOffsetDays is relative to the shoot. */
export const DEFAULT_PROJECT_TASKS: { stage: string; title: string; dueOffsetDays: number | null }[] = [
  { stage: 'preshoot', title: 'Confirm shoot details', dueOffsetDays: null },
  { stage: 'preshoot', title: 'Send pre-shoot reminder', dueOffsetDays: -2 },
  { stage: 'preshoot', title: 'Pre-shoot confirmation call', dueOffsetDays: -1 },
  { stage: 'shoot', title: 'Mark shoot completed', dueOffsetDays: 0 },
  { stage: 'editing', title: 'Upload and cull photos', dueOffsetDays: 1 },
  { stage: 'editing', title: 'Send photos to editor', dueOffsetDays: 2 },
  { stage: 'editing', title: 'Editing completed', dueOffsetDays: null },
  { stage: 'editing', title: 'Review edited photos', dueOffsetDays: null },
  { stage: 'delivery', title: 'Confirm final delivery', dueOffsetDays: null },
]

export type TaskInput = {
  id: string
  title: string
  status: string
  stage: string | null
  dueAt: Date | null
  order: number
  completedByName: string | null
  completedAt: Date | null
}

export type BoardDerivedRow = { key: string; title: string; done: boolean; dueLabel: string | null; note: string | null }
export type BoardTaskRow = {
  id: string
  title: string
  done: boolean
  dueLabel: string | null
  dueValue: string | null
  completedByName: string | null
  completedAt: Date | null
}
export type BoardStage = {
  key: string
  label: string
  color: string
  active: boolean
  derived: BoardDerivedRow[]
  tasks: BoardTaskRow[]
}
export type ProjectBoard = { stages: BoardStage[]; allDone: boolean }

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Build the board from real backend state: derived facts + the project's editable task rows. */
export function buildProjectBoard(
  facts: ProjectFacts,
  tasks: TaskInput[],
  shootDate: Date | null,
  formatDate: (d: Date) => string,
): ProjectBoard {
  let activeKey: string | null = null

  const stages: BoardStage[] = PROJECT_STAGES.map((stage) => {
    const derived: BoardDerivedRow[] = stage.derived.map((d) => ({
      key: d.key,
      title: d.title,
      done: facts[d.fact],
      dueLabel: d.showShootDate && shootDate ? formatDate(shootDate) : null,
      note: d.note ?? null,
    }))
    const stageTasks: BoardTaskRow[] = tasks
      .filter((t) => t.stage === stage.key)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        title: t.title,
        done: t.status === 'COMPLETED',
        dueLabel: t.dueAt ? formatDate(t.dueAt) : null,
        dueValue: t.dueAt ? isoDate(t.dueAt) : null,
        completedByName: t.completedByName,
        completedAt: t.completedAt,
      }))

    const incomplete = derived.some((d) => !d.done) || stageTasks.some((t) => !t.done)
    if (incomplete && activeKey === null) activeKey = stage.key

    return { key: stage.key, label: stage.label, color: stage.color, active: false, derived, tasks: stageTasks }
  })

  for (const s of stages) s.active = s.key === activeKey
  return { stages, allDone: activeKey === null }
}
