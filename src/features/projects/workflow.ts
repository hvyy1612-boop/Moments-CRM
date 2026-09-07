
import { addDays, dueToneFor, TASK_TYPE_LABEL, type DueTone, type TaskType } from '@/features/enquiries/workflow'

export { ADDABLE_TASK_TYPES } from '@/features/enquiries/workflow'
export type { TaskType } from '@/features/enquiries/workflow'

export type ProjectFacts = { gallerySent: boolean; finalPaid: boolean }

type StageDef = { key: string; label: string; color: string; optional?: boolean }

export const PROJECT_STAGES: StageDef[] = [
  { key: 'planning', label: 'Planning', color: 'enquiry' },
  { key: 'preshoot', label: 'Pre-wedding shoot', color: 'booked', optional: true },
  { key: 'finalprep', label: 'Pre-wedding preparation', color: 'quote' },
  { key: 'shootday', label: 'Wedding day', color: 'booked' },
  { key: 'editing', label: 'Editing and post-production', color: 'editing' },
  { key: 'video', label: 'Video editing', color: 'editing', optional: true },
  { key: 'film', label: 'Film processing', color: 'editing', optional: true },
  { key: 'album', label: 'Album and prints', color: 'editing', optional: true },
  { key: 'delivery', label: 'Delivery and close', color: 'delivered' },
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
  { stage: 'planning', title: 'Collect wedding and shoot details', type: 'TODO' },
  { stage: 'planning', title: 'Confirm timeline and venue details', type: 'TODO' },
  { stage: 'planning', title: 'Confirm photography and video coverage', type: 'TODO' },

  { stage: 'finalprep', title: 'Review final shoot information', type: 'TODO' },
  { stage: 'finalprep', title: 'Schedule final planning call', type: 'APPOINTMENT' },
  { stage: 'finalprep', title: 'Confirm final timeline and shoot details', type: 'TODO' },

  { stage: 'shootday', title: 'Photograph and film the wedding day', type: 'SHOOT' },
  { stage: 'shootday', title: 'Back up all captured files', type: 'TODO' },

  { stage: 'editing', title: 'Cull wedding images', type: 'TODO' },
  { stage: 'editing', title: 'Edit wedding images', type: 'TODO' },
  { stage: 'editing', title: 'Finalise wedding gallery', type: 'TODO' },

  { stage: 'delivery', title: 'Send final gallery to client', type: 'TODO' },
  { stage: 'delivery', title: 'Confirm client received deliverables', type: 'TODO' },
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

export const PROJECT_TASK_NOTE: Record<string, string> = {
  'Send client welcome email': 'Sent automatically once the booking is confirmed.',
  'Collect wedding and shoot details': 'Gather the timeline, venues, and key people.',
  'Confirm timeline and venue details': 'Confirm the run sheet and locations.',
  'Record special requests': 'Note the must-have shots and special moments.',
  'Confirm photography and video coverage': 'Confirm what the package includes.',
  'Send pre-shoot questionnaire and reminder': 'Sent automatically about three weeks before the shoot.',
  'Review final shoot information': "Check the client's answers before the day.",
  'Schedule final planning call': 'Book a call about a week before the shoot.',
  'Confirm final timeline and shoot details': 'Lock the final run sheet with the client.',
  'Send final payment reminder': 'Sent automatically about two weeks before the shoot.',
  'Photograph and film the wedding day': 'Capture photo and video on the day per the agreed coverage.',
  'Back up all captured files': 'Copy every card to two drives before deleting.',
  'Prepare preview images': 'Select and edit a small preview set.',
  'Send preview gallery to client': 'Share a first look within a few days.',
  'Cull wedding images': 'Choose the final selects from the full take.',
  'Edit wedding images': 'Edit the selected images to the studio standard.',
  'Review edited gallery': 'Quality-check the full gallery before delivery.',
  'Finalise wedding gallery': 'Approve the gallery for delivery.',
  'Prepare final client deliverables': 'Assemble the gallery, files, and any prints.',
  'Send final gallery to client': 'Deliver the full gallery to the client.',
  'Gallery delivered': 'Ticks itself when the gallery is published.',
  'Confirm client received deliverables': 'Confirm the client has downloaded everything.',
  'Confirm final payment received': 'Ticks itself when the balance is paid.',
  'Send final thank-you email': 'Sent automatically after delivery.',
  'Archive project files': 'Move the finished files to long-term storage.',
  'Close project': 'Mark the job complete.',

  'Schedule pre-wedding shoot': 'Book the engagement or pre-wedding session.',
  'Confirm pre-wedding shoot details': 'Confirm the date, location, and outfits.',
  'Conduct pre-wedding shoot': 'Shoot the pre-wedding session.',
  'Back up pre-wedding images': 'Copy every card to two drives.',
  'Edit and send pre-wedding photos': 'Edit and deliver the pre-wedding gallery.',
  'Prepare video footage for editing': 'Organise and back up the footage.',
  'Edit wedding film': 'Cut the wedding film to the agreed length.',
  'Colour grade wedding film': 'Grade the film to the studio look.',
  'Review final wedding film': 'Quality-check the film before delivery.',
  'Finalise wedding film': 'Approve the film for delivery.',
  'Send film for processing and scanning': 'Send the rolls to the lab for developing.',
  'Review film scans': 'Check the scans when they return.',
  'Add film images to client gallery': 'Add the film selects to the gallery.',
  'Prepare album design': "Design the album from the client's favourites.",
  'Send album draft to client': 'Share the draft for review.',
  'Review client album changes': 'Collect and note the requested changes.',
  'Update album design': "Apply the client's changes.",
  'Approve album for production': 'Get final sign-off before printing.',
  'Send album to print': 'Order the album from the printer.',
  'Quality check finished products': 'Inspect the album on arrival.',
}

export const PROJECT_TASK_SCHEDULE: Record<string, number> = {
  'Send client welcome email': -60,
  'Collect wedding and shoot details': -45,
  'Confirm timeline and venue details': -30,
  'Record special requests': -30,
  'Confirm photography and video coverage': -28,
  'Send pre-shoot questionnaire and reminder': -21,
  'Send final payment reminder': -14,
  'Review final shoot information': -14,
  'Schedule final planning call': -10,
  'Confirm final timeline and shoot details': -7,
  'Photograph and film the wedding day': 0,
  'Back up all captured files': 1,
  'Prepare preview images': 3,
  'Send preview gallery to client': 5,
  'Cull wedding images': 7,
  'Edit wedding images': 21,
  'Review edited gallery': 35,
  'Finalise wedding gallery': 40,
  'Prepare final client deliverables': 42,
  'Send final gallery to client': 42,
  'Gallery delivered': 42,
  'Confirm client received deliverables': 45,
  'Confirm final payment received': 49,
  'Send final thank-you email': 50,
  'Archive project files': 56,
  'Close project': 56,

  'Schedule pre-wedding shoot': -90,
  'Confirm pre-wedding shoot details': -75,
  'Conduct pre-wedding shoot': -60,
  'Back up pre-wedding images': -59,
  'Edit and send pre-wedding photos': -45,
  'Prepare video footage for editing': 3,
  'Edit wedding film': 30,
  'Colour grade wedding film': 45,
  'Review final wedding film': 50,
  'Finalise wedding film': 55,
  'Send film for processing and scanning': 2,
  'Review film scans': 14,
  'Add film images to client gallery': 20,
  'Prepare album design': 45,
  'Send album draft to client': 50,
  'Review client album changes': 57,
  'Update album design': 60,
  'Approve album for production': 63,
  'Send album to print': 65,
  'Quality check finished products': 75,
}

export const PROJECT_TASK_BLOCKED_BY: Record<string, string> = {
  'Edit wedding images': 'Cull wedding images',
  'Finalise wedding gallery': 'Edit wedding images',
  'Send final gallery to client': 'Finalise wedding gallery',
  'Confirm client received deliverables': 'Send final gallery to client',
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
  note: string | null
  editable: boolean
  done: boolean
  dueLabel: string | null
  dueValue: string | null
  noDate: boolean
  dueTone: DueTone
  blocked: boolean
  blockedBy: string | null
  completedByName: string | null
  completedAt: Date | null
}
export type BoardStage = {
  key: string
  label: string
  color: string
  optional: boolean
  active: boolean
  done: number
  total: number
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
  shootDate: Date | null = null,
  now: Date | null = null,
): ProjectBoard {
  const isDone = (t: TaskInput): boolean => {
    const isAuto = t.type === 'AUTO'
    const fact = isAuto ? AUTO_FACT_BY_TITLE[t.title] : undefined
    return isAuto ? (fact ? facts[fact] : false) : t.status === 'COMPLETED'
  }
  const doneTitles = new Set(tasks.filter(isDone).map((t) => t.title))
  let activeKey: string | null = null
  const stages: BoardStage[] = PROJECT_STAGES.map((stage) => {
    const stageTasks: BoardTaskRow[] = tasks
      .filter((t) => t.stage === stage.key)
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const type = (t.type as TaskType) ?? 'TODO'
        const isAuto = type === 'AUTO'
        const done = isDone(t)
        const offset = PROJECT_TASK_SCHEDULE[t.title]
        let dueDate: Date | null = t.dueAt ?? null
        let noDate = false
        if (!dueDate && offset !== undefined) {
          if (shootDate) dueDate = addDays(shootDate, offset)
          else noDate = true
        }
        const blockedBy = PROJECT_TASK_BLOCKED_BY[t.title] ?? null
        return {
          id: t.id,
          title: t.title,
          type,
          typeLabel: TASK_TYPE_LABEL[type] ?? '',
          note: PROJECT_TASK_NOTE[t.title] ?? null,
          editable: !isAuto,
          done,
          dueLabel: dueDate ? formatDate(dueDate) : null,
          dueValue: dueDate ? isoDate(dueDate) : null,
          noDate,
          dueTone: dueToneFor(dueDate, done, now),
          blocked: !done && !isAuto && blockedBy ? !doneTitles.has(blockedBy) : false,
          blockedBy,
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
      done: stageTasks.filter((t) => t.done).length,
      total: stageTasks.length,
      tasks: stageTasks,
    }
  })
  for (const s of stages) s.active = s.key === activeKey
  return { stages, allDone: activeKey === null }
}
