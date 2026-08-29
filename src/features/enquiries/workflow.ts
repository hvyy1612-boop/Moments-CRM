

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

export const ENQUIRY_TASK_NOTE: Record<string, string> = {
  'Enquiry received': 'Logged automatically when the enquiry arrives.',
  'Send initial enquiry response': 'Reply within 24 hours of the enquiry.',
  'Follow up on enquiry': 'Follow up if there is no reply after 2 to 3 days.',
  'Discuss shoot requirements': 'Confirm the date, location, and coverage.',
  'Schedule client consultation': 'Book a call or meeting to talk through the shoot.',
  'Confirm shoot date and requirements': 'Lock the date and scope before quoting.',
  'Prepare client quote': 'Build the quote from the agreed package.',
  'Send client quote': 'Send the quote and note when a reply is due.',
  'Follow up on quote': 'Follow up if the quote is unanswered after 3 days.',
  'Update quote based on client request': 'Revise and resend if the client asks for changes.',
  'Send contract and deposit invoice': 'Send the contract and deposit to secure the booking.',
}

export const ENQUIRY_TASK_SCHEDULE: Record<string, number> = {
  'Send initial enquiry response': 1,
  'Follow up on enquiry': 3,
  'Discuss shoot requirements': 5,
  'Schedule client consultation': 7,
  'Confirm shoot date and requirements': 10,
  'Prepare client quote': 12,
  'Send client quote': 13,
  'Follow up on quote': 16,
  'Update quote based on client request': 18,
  'Send contract and deposit invoice': 20,
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime())
  d.setDate(d.getDate() + days)
  return d
}

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
  note: string | null
  editable: boolean
  done: boolean
  dueLabel: string | null
  dueValue: string | null
  noDate: boolean
  completedByName: string | null
  completedAt: Date | null
}
export type EnqStage = { key: string; label: string; color: string; active: boolean; tasks: EnqTaskRow[] }
export type EnquiryBoard = { stages: EnqStage[]; allDone: boolean }

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildEnquiryBoard(
  tasks: TaskInput[],
  formatDate: (d: Date) => string,
  anchorDate: Date | null = null,
): EnquiryBoard {
  let activeKey: string | null = null
  const stages: EnqStage[] = ENQUIRY_STAGES.map((stage) => {
    const stageTasks: EnqTaskRow[] = tasks
      .filter((t) => t.stage === stage.key)
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const type = (t.type as TaskType) ?? 'TODO'
        const offset = ENQUIRY_TASK_SCHEDULE[t.title]
        let dueDate: Date | null = t.dueAt ?? null
        let noDate = false
        if (!dueDate && offset !== undefined) {
          if (anchorDate) dueDate = addDays(anchorDate, offset)
          else noDate = true
        }
        return {
          id: t.id,
          title: t.title,
          type,
          typeLabel: TASK_TYPE_LABEL[type] ?? '',
          note: ENQUIRY_TASK_NOTE[t.title] ?? null,
          editable: type !== 'AUTO',
          done: t.status === 'COMPLETED',
          dueLabel: dueDate ? formatDate(dueDate) : null,
          dueValue: dueDate ? isoDate(dueDate) : null,
          noDate,
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
