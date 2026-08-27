
import { TASK_TYPE_LABEL, type TaskType } from '@/features/enquiries/workflow'

export { ADDABLE_TASK_TYPES } from '@/features/enquiries/workflow'
export type { TaskType } from '@/features/enquiries/workflow'

export type ProjectFacts = { gallerySent: boolean; finalPaid: boolean }

type StageDef = { key: string; label: string; color: string; optional?: boolean }

export const PROJECT_STAGES: StageDef[] = [
  { key: 'planning', label: 'Planning', color: 'enquiry' },
  { key: 'preshoot', label: 'Pre-wedding shoot', color: 'booked', optional: true },
  { key: 'finalprep', label: 'Final shoot preparation', color: 'quote' },
  { key: 'shootday', label: 'Shoot day', color: 'booked' },
  { key: 'editing', label: 'Photo editing', color: 'editing' },
  { key: 'video', label: 'Video editing', color: 'editing', optional: true },
  { key: 'film', label: 'Film processing', color: 'editing', optional: true },
  { key: 'album', label: 'Album and prints', color: 'editing', optional: true },
  { key: 'delivery', label: 'Final delivery and close', color: 'delivered' },
]

export const PROJECT_STAGE_KEYS: ReadonlySet<string> = new Set(PROJECT_STAGES.map((s) => s.key))

export function stageLabel(key: string): string {
  return PROJECT_STAGES.find((s) => s.key === key)?.label ?? key
}

export const AUTO_FACT_BY_TITLE: Record<string, keyof ProjectFacts> = {
  'Gallery delivered': 'gallerySent',
  'Confirm final payment received': 'finalPaid',
}

export const DEFAULT_PROJECT_TASKS: { stage: string; title: string; type: TaskType }[] = [
  { stage: 'planning', title: 'Send client welcome email', type: 'AUTO_EMAIL' },
  { stage: 'planning', title: 'Collect wedding and shoot details', type: 'TODO' },
  { stage: 'planning', title: 'Confirm timeline and venue details', type: 'TODO' },
  { stage: 'planning', title: 'Record special requests', type: 'TODO' },
  { stage: 'planning', title: 'Confirm photography and video coverage', type: 'TODO' },

  { stage: 'finalprep', title: 'Send pre-shoot questionnaire and reminder', type: 'AUTO_EMAIL' },
  { stage: 'finalprep', title: 'Review final shoot information', type: 'TODO' },
  { stage: 'finalprep', title: 'Schedule final planning call', type: 'APPOINTMENT' },
  { stage: 'finalprep', title: 'Confirm final timeline and shoot details', type: 'TODO' },
  { stage: 'finalprep', title: 'Send final payment reminder', type: 'AUTO_EMAIL' },

  { stage: 'shootday', title: 'Conduct wedding photography', type: 'SHOOT' },
  { stage: 'shootday', title: 'Back up all captured files', type: 'TODO' },

  { stage: 'editing', title: 'Prepare preview images', type: 'TODO' },
  { stage: 'editing', title: 'Send preview gallery to client', type: 'TODO' },
  { stage: 'editing', title: 'Cull wedding images', type: 'TODO' },
  { stage: 'editing', title: 'Edit wedding images', type: 'TODO' },
  { stage: 'editing', title: 'Review edited gallery', type: 'TODO' },
  { stage: 'editing', title: 'Finalise wedding gallery', type: 'TODO' },

  { stage: 'delivery', title: 'Prepare final client deliverables', type: 'TODO' },
  { stage: 'delivery', title: 'Send final gallery to client', type: 'TODO' },
  { stage: 'delivery', title: 'Gallery delivered', type: 'AUTO' },
  { stage: 'delivery', title: 'Confirm client received deliverables', type: 'TODO' },
  { stage: 'delivery', title: 'Confirm final payment received', type: 'AUTO' },
  { stage: 'delivery', title: 'Send final thank-you email', type: 'AUTO_EMAIL' },
  { stage: 'delivery', title: 'Archive project files', type: 'TODO' },
  { stage: 'delivery', title: 'Close project', type: 'TODO' },
]

export const OPTIONAL_STAGE_TASKS: Record<string, { title: string; type: TaskType }[]> = {
  preshoot: [
    { title: 'Schedule pre-wedding shoot', type: 'APPOINTMENT' },
    { title: 'Confirm pre-wedding shoot details', type: 'TODO' },
    { title: 'Conduct pre-wedding shoot', type: 'SHOOT' },
    { title: 'Back up pre-wedding images', type: 'TODO' },
    { title: 'Edit and send pre-wedding photos', type: 'TODO' },
  ],
  video: [
    { title: 'Prepare video footage for editing', type: 'TODO' },
    { title: 'Edit wedding film', type: 'TODO' },
    { title: 'Colour grade wedding film', type: 'TODO' },
    { title: 'Review final wedding film', type: 'TODO' },
    { title: 'Finalise wedding film', type: 'TODO' },
  ],
  film: [
    { title: 'Send film for processing and scanning', type: 'TODO' },
    { title: 'Review film scans', type: 'TODO' },
    { title: 'Add film images to client gallery', type: 'TODO' },
  ],
  album: [
    { title: 'Prepare album design', type: 'TODO' },
    { title: 'Send album draft to client', type: 'TODO' },
    { title: 'Review client album changes', type: 'TODO' },
    { title: 'Update album design', type: 'TODO' },
    { title: 'Approve album for production', type: 'TODO' },
    { title: 'Send album to print', type: 'TODO' },
    { title: 'Quality check finished products', type: 'TODO' },
  ],
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

export type BoardTaskRow = {
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
export type BoardStage = {
  key: string
  label: string
  color: string
  optional: boolean
  active: boolean
  tasks: BoardTaskRow[]
}
export type ProjectBoard = { stages: BoardStage[]; allDone: boolean }

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildProjectBoard(
  facts: ProjectFacts,
  tasks: TaskInput[],
  formatDate: (d: Date) => string,
): ProjectBoard {
  let activeKey: string | null = null
  const stages: BoardStage[] = PROJECT_STAGES.map((stage) => {
    const stageTasks: BoardTaskRow[] = tasks
      .filter((t) => t.stage === stage.key)
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const type = (t.type as TaskType) ?? 'TODO'
        const isAuto = type === 'AUTO'
        const fact = isAuto ? AUTO_FACT_BY_TITLE[t.title] : undefined
        const done = isAuto ? (fact ? facts[fact] : false) : t.status === 'COMPLETED'
        return {
          id: t.id,
          title: t.title,
          type,
          typeLabel: TASK_TYPE_LABEL[type] ?? '',
          editable: !isAuto,
          done,
          dueLabel: t.dueAt ? formatDate(t.dueAt) : null,
          dueValue: t.dueAt ? isoDate(t.dueAt) : null,
          completedByName: t.completedByName,
          completedAt: t.completedAt,
        }
      })
    if (stageTasks.some((t) => !t.done) && activeKey === null) activeKey = stage.key
    return {
      key: stage.key,
      label: stage.label,
      color: stage.color,
      optional: stage.optional ?? false,
      active: false,
      tasks: stageTasks,
    }
  })
  for (const s of stages) s.active = s.key === activeKey
  return { stages, allDone: activeKey === null }
}
