

export function currentActionText(waitingOn: string | null, pendingTitle: string | null): string {
  if (waitingOn === 'CLIENT') return 'Waiting for client reply'
  if (pendingTitle) return `Staff needs to: ${pendingTitle.toLowerCase()}`
  if (waitingOn === 'STUDIO') return 'Staff needs to act'
  return '-'
}

type StageDef = { key: string; label: string; color: string }

export const ENQUIRY_STAGES: StageDef[] = [
  { key: 'new', label: 'New enquiry', color: 'enquiry' },
  { key: 'discussing', label: 'Discussing details', color: 'quote' },
  { key: 'quote', label: 'Preparing quote', color: 'booked' },
]

export const ENQUIRY_STAGE_KEYS: ReadonlySet<string> = new Set(ENQUIRY_STAGES.map((s) => s.key))

export function enquiryStageLabel(key: string): string {
  return ENQUIRY_STAGES.find((s) => s.key === key)?.label ?? key
}

export const DEFAULT_ENQUIRY_TASKS: { stage: string; title: string }[] = [
  { stage: 'new', title: 'Review enquiry' },
  { stage: 'new', title: 'Reply to client' },
  { stage: 'discussing', title: 'Review client reply' },
  { stage: 'discussing', title: 'Confirm details' },
  { stage: 'quote', title: 'Prepare quote' },
  { stage: 'quote', title: 'Send quote' },
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

export type EnqTaskRow = {
  id: string
  title: string
  done: boolean
  dueLabel: string | null
  dueValue: string | null
  completedByName: string | null
  completedAt: Date | null
}
export type EnqStage = { key: string; label: string; color: string; active: boolean; tasks: EnqTaskRow[] }
export type EnquiryBoard = { stages: EnqStage[]; allDone: boolean }

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildEnquiryBoard(tasks: TaskInput[], formatDate: (d: Date) => string): EnquiryBoard {
  let activeKey: string | null = null
  const stages: EnqStage[] = ENQUIRY_STAGES.map((stage) => {
    const stageTasks: EnqTaskRow[] = tasks
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
    if (stageTasks.some((t) => !t.done) && activeKey === null) activeKey = stage.key
    return { key: stage.key, label: stage.label, color: stage.color, active: false, tasks: stageTasks }
  })
  for (const s of stages) s.active = s.key === activeKey
  return { stages, allDone: activeKey === null }
}
