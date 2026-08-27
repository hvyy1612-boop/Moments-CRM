/**
 * Enquiry workflow - editable per case. Two stages live on the lead: Enquiry (first contact and
 * discussion) and Quote and booking (quote, contract, deposit). "Booking confirmed" is the Book-it
 * action that turns the lead into a Project (Studio-Ninja style). Tasks carry a type so the board can
 * tag them (Auto email / Appointment / Shoot / Auto); plain To-do tasks show no tag.
 */

export function currentActionText(waitingOn: string | null, pendingTitle: string | null): string {
  if (waitingOn === 'CLIENT') return 'Waiting for client reply'
  if (pendingTitle) return `Staff needs to: ${pendingTitle.toLowerCase()}`
  if (waitingOn === 'STUDIO') return 'Staff needs to act'
  return '-'
}

export type TaskType = 'TODO' | 'AUTO_EMAIL' | 'APPOINTMENT' | 'SHOOT' | 'AUTO'

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TODO: '',
  AUTO_EMAIL: 'Auto email',
  APPOINTMENT: 'Appointment',
  SHOOT: 'Shoot',
  AUTO: 'Auto',
}

/** Types a staff member can pick when adding a task (AUTO is system-only). */
export const ADDABLE_TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'TODO', label: 'To-do' },
  { value: 'AUTO_EMAIL', label: 'Auto email' },
  { value: 'APPOINTMENT', label: 'Appointment' },
  { value: 'SHOOT', label: 'Shoot' },
]

type StageDef = { key: string; label: string; color: string }

export const ENQUIRY_STAGES: StageDef[] = [
  { key: 'enquiry', label: 'Enquiry', color: 'enquiry' },
  { key: 'quote', label: 'Quote and booking', color: 'quote' },
]

export const ENQUIRY_STAGE_KEYS: ReadonlySet<string> = new Set(ENQUIRY_STAGES.map((s) => s.key))

export function enquiryStageLabel(key: string): string {
  return ENQUIRY_STAGES.find((s) => s.key === key)?.label ?? key
}

/** Default suggested flow a new enquiry is seeded with. `done` seeds a completed AUTO row. */
export const DEFAULT_ENQUIRY_TASKS: { stage: string; title: string; type: TaskType; done?: boolean }[] = [
  { stage: 'enquiry', title: 'Enquiry received', type: 'AUTO', done: true },
  { stage: 'enquiry', title: 'Send initial enquiry response', type: 'TODO' },
  { stage: 'enquiry', title: 'Follow up on enquiry', type: 'TODO' },
  { stage: 'enquiry', title: 'Discuss shoot requirements', type: 'TODO' },
  { stage: 'enquiry', title: 'Schedule client consultation', type: 'APPOINTMENT' },
  { stage: 'enquiry', title: 'Confirm shoot date and requirements', type: 'TODO' },
  { stage: 'quote', title: 'Prepare client quote', type: 'TODO' },
  { stage: 'quote', title: 'Send client quote', type: 'TODO' },
  { stage: 'quote', title: 'Follow up on quote', type: 'TODO' },
  { stage: 'quote', title: 'Update quote based on client request', type: 'TODO' },
  { stage: 'quote', title: 'Send contract and deposit invoice', type: 'TODO' },
]

export type TaskInput = {
  id: string
  title: string
  status: string
  stage: string | null
  type: string
  dueAt: Date | null
  order: number
  completedByName: string | null
  completedAt: Date | null
}

export type EnqTaskRow = {
  id: string
  title: string
  type: TaskType
  typeLabel: string
  editable: boolean
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
      .map((t) => {
        const type = (t.type as TaskType) ?? 'TODO'
        return {
          id: t.id,
          title: t.title,
          type,
          typeLabel: TASK_TYPE_LABEL[type] ?? '',
          editable: type !== 'AUTO',
          done: t.status === 'COMPLETED',
          dueLabel: t.dueAt ? formatDate(t.dueAt) : null,
          dueValue: t.dueAt ? isoDate(t.dueAt) : null,
          completedByName: t.completedByName,
          completedAt: t.completedAt,
        }
      })
    if (stageTasks.some((t) => !t.done) && activeKey === null) activeKey = stage.key
    return { key: stage.key, label: stage.label, color: stage.color, active: false, tasks: stageTasks }
  })
  for (const s of stages) s.active = s.key === activeKey
  return { stages, allDone: activeKey === null }
}
