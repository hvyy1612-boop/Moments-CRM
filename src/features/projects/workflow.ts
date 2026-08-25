

export type ProjectFacts = {

  booked: boolean
  shootScheduled: boolean
  galleryPrepared: boolean
  gallerySent: boolean
}

export type StepTag = 'AUTO' | 'TASK' | 'EMAIL' | 'SHOOT'

type StepDef =
  | { key: string; title: string; type: 'derived'; fact: keyof ProjectFacts; tag: StepTag; note?: string; showShootDate?: boolean }
  | { key: string; title: string; type: 'task'; kind: string; tag: StepTag; dueOffsetDays?: number }

type PhaseDef = { key: string; label: string; color: string; steps: StepDef[] }

export const PROJECT_WORKFLOW_PHASES: PhaseDef[] = [
  {
    key: 'booking',
    label: 'Booking',
    color: 'booked',
    steps: [
      {
        key: 'booking_confirmed',
        title: 'Booking confirmed',
        type: 'derived',
        fact: 'booked',
        tag: 'AUTO',
        note: 'Auto-checks when a quote is accepted, a contract is signed, or a deposit is paid.',
      },
    ],
  },
  {
    key: 'preshoot',
    label: 'Pre-shoot',
    color: 'enquiry',
    steps: [
      { key: 'confirm_shoot_details', title: 'Confirm shoot details', type: 'task', kind: 'CONFIRM_SHOOT_DETAILS', tag: 'TASK' },
      { key: 'send_preshoot_reminder', title: 'Send pre-shoot reminder', type: 'task', kind: 'SEND_PRESHOOT_REMINDER', tag: 'EMAIL', dueOffsetDays: -2 },
      { key: 'preshoot_call', title: 'Pre-shoot confirmation call', type: 'task', kind: 'PRESHOOT_CALL', tag: 'TASK', dueOffsetDays: -1 },
    ],
  },
  {
    key: 'shoot',
    label: 'Shoot',
    color: 'quote',
    steps: [
      { key: 'main_shoot', title: 'Main shoot', type: 'derived', fact: 'shootScheduled', tag: 'SHOOT', showShootDate: true, note: 'From the scheduled booking.' },
      { key: 'shoot_completed', title: 'Mark shoot completed', type: 'task', kind: 'MARK_SHOOT_COMPLETED', tag: 'TASK', dueOffsetDays: 0 },
    ],
  },
  {
    key: 'editing',
    label: 'Editing',
    color: 'editing',
    steps: [
      { key: 'upload_cull', title: 'Upload and cull photos', type: 'task', kind: 'UPLOAD_CULL', tag: 'TASK', dueOffsetDays: 1 },
      { key: 'send_to_editor', title: 'Send photos to editor', type: 'task', kind: 'SEND_TO_EDITOR', tag: 'TASK', dueOffsetDays: 2 },
      { key: 'editing_completed', title: 'Editing completed', type: 'task', kind: 'EDITING_COMPLETED', tag: 'TASK' },
      { key: 'review_edits', title: 'Review edited photos', type: 'task', kind: 'REVIEW_EDITS', tag: 'TASK' },
    ],
  },
  {
    key: 'delivery',
    label: 'Delivery',
    color: 'delivered',
    steps: [
      { key: 'gallery_prepared', title: 'Prepare final gallery', type: 'derived', fact: 'galleryPrepared', tag: 'AUTO' },
      { key: 'gallery_sent', title: 'Send gallery to client', type: 'derived', fact: 'gallerySent', tag: 'AUTO' },
      { key: 'confirm_delivery', title: 'Confirm final delivery', type: 'task', kind: 'CONFIRM_DELIVERY', tag: 'TASK' },
    ],
  },
]

export const PROJECT_TASKS: { kind: string; title: string; phaseKey: string; order: number }[] = []
const PROJECT_TASK_KIND: Record<string, true> = {}
{
  let order = 0
  for (const phase of PROJECT_WORKFLOW_PHASES) {
    for (const step of phase.steps) {
      if (step.type === 'task') {
        PROJECT_TASKS.push({ kind: step.kind, title: step.title, phaseKey: phase.key, order: order++ })
        PROJECT_TASK_KIND[step.kind] = true
      }
    }
  }
}

export const PROJECT_TASK_KINDS: ReadonlySet<string> = new Set(Object.keys(PROJECT_TASK_KIND))

export const STEP_TAG_LABEL: Record<StepTag, string> = {
  AUTO: 'Auto',
  TASK: 'Task',
  EMAIL: 'Email',
  SHOOT: 'Main shoot',
}

export type WorkItemLite = {
  id: string
  kind: string
  status: string
  completedAt: Date | null
  completedByName: string | null
}

export type ProjectBoardStep = {
  key: string
  title: string
  type: 'derived' | 'task'
  tag: StepTag
  done: boolean

  workItemId: string | null
  completedByName: string | null
  completedAt: Date | null
  dueLabel: string | null
  note: string | null
}

export type ProjectBoardPhase = {
  key: string
  label: string
  color: string
  active: boolean
  steps: ProjectBoardStep[]
}

export type ProjectBoard = { phases: ProjectBoardPhase[]; activePhaseKey: string | null; allDone: boolean }

export function buildProjectBoard(
  facts: ProjectFacts,
  workItems: WorkItemLite[],
  shootDate: Date | null,
  formatDate: (d: Date) => string,
): ProjectBoard {
  const byKind = new Map<string, WorkItemLite>()
  for (const w of workItems) byKind.set(w.kind, w)

  const dueLabelFor = (offset: number | undefined): string | null => {
    if (offset == null || !shootDate) return null
    const d = new Date(shootDate.getTime() + offset * 86_400_000)
    return formatDate(d)
  }

  let activePhaseKey: string | null = null
  const phases: ProjectBoardPhase[] = PROJECT_WORKFLOW_PHASES.map((phase) => {
    const steps: ProjectBoardStep[] = phase.steps.map((step) => {
      if (step.type === 'derived') {
        return {
          key: step.key,
          title: step.title,
          type: 'derived',
          tag: step.tag,
          done: facts[step.fact],
          workItemId: null,
          completedByName: null,
          completedAt: null,
          dueLabel: step.showShootDate && shootDate ? formatDate(shootDate) : null,
          note: step.note ?? null,
        }
      }
      const wi = byKind.get(step.kind)
      const done = wi?.status === 'COMPLETED'
      return {
        key: step.key,
        title: step.title,
        type: 'task',
        tag: step.tag,
        done,
        workItemId: wi?.id ?? null,
        completedByName: wi?.completedByName ?? null,
        completedAt: wi?.completedAt ?? null,
        dueLabel: dueLabelFor(step.dueOffsetDays),
        note: null,
      }
    })
    const phaseComplete = steps.every((s) => s.done)
    if (!phaseComplete && activePhaseKey === null) activePhaseKey = phase.key
    return { key: phase.key, label: phase.label, color: phase.color, active: false, steps }
  })

  for (const phase of phases) phase.active = phase.key === activePhaseKey
  const allDone = activePhaseKey === null
  return { phases, activePhaseKey, allDone }
}
