
import { dueToneFor, TASK_TYPE_LABEL, type DueTone, type TaskType } from '@/features/enquiries/workflow'
import type { DueAnchor } from '@/lib/domain/deadline'
import { sydneyDateTimeParts } from '@/lib/time'

export { JOB_TASK_TYPES } from '@/features/enquiries/workflow'
export type { TaskType } from '@/features/enquiries/workflow'

type StageDef = { key: string; label: string; color: string; optional?: boolean }

export const PROJECT_STAGES: StageDef[] = [
  { key: 'preshoot', label: 'Pre-shoot', color: 'quote' },
  { key: 'shoot', label: 'Shoot', color: 'booked' },
  { key: 'editing', label: 'Editing', color: 'editing' },
  { key: 'delivery', label: 'Delivery', color: 'delivered' },
  { key: 'video', label: 'Video editing', color: 'editing', optional: true },
  { key: 'film', label: 'Film processing', color: 'editing', optional: true },
  { key: 'album', label: 'Album and prints', color: 'editing', optional: true },
]

export const PROJECT_STAGE_KEYS: ReadonlySet<string> = new Set(PROJECT_STAGES.map((s) => s.key))

export function stageLabel(key: string): string {
  return PROJECT_STAGES.find((s) => s.key === key)?.label ?? key
}

export const DEFAULT_PROJECT_TASKS: { stage: string; key: string; title: string; type: TaskType }[] = [
  { stage: 'preshoot', key: 'confirm_shoot_details', title: 'Confirm shoot details', type: 'TODO' },
  { stage: 'preshoot', key: 'send_pre_shoot_reminder', title: 'Send pre-shoot reminder', type: 'TODO' },

  { stage: 'shoot', key: 'shoot_scheduled', title: 'Shoot scheduled', type: 'TODO' },
  { stage: 'shoot', key: 'mark_shoot_completed', title: 'Mark shoot completed', type: 'SHOOT' },

  { stage: 'editing', key: 'send_files_to_editor', title: 'Send files to editor', type: 'TODO' },
  { stage: 'editing', key: 'confirm_editing_completed', title: 'Confirm editing completed', type: 'TODO' },
  { stage: 'editing', key: 'review_final_edits', title: 'Review final edits', type: 'TODO' },

  { stage: 'delivery', key: 'prepare_client_gallery', title: 'Prepare client gallery', type: 'TODO' },
  { stage: 'delivery', key: 'send_client_gallery', title: 'Send client gallery', type: 'TODO' },
  { stage: 'delivery', key: 'issue_final_invoice', title: 'Issue final invoice', type: 'TODO' },
  { stage: 'delivery', key: 'final_payment_received', title: 'Final payment received', type: 'TODO' },
]

export const CORE_TASK_KEY_BY_TITLE: Record<string, string> = Object.fromEntries(
  DEFAULT_PROJECT_TASKS.map((t) => [t.title, t.key]),
)
export const CUSTOM_TASK_KIND = 'CUSTOM'

export const OPTIONAL_STAGE_TASKS: Record<string, { title: string; type: TaskType }[]> = {
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
  'Shoot scheduled': 'Tick once a shoot date is booked with the client.',
  'Confirm shoot details': 'Lock the date, timeline, locations, and key people with the client.',
  'Send pre-shoot reminder': 'Remind the client of the details shortly before the shoot.',
  'Mark shoot completed': 'Tick once the shoot has been photographed and filmed.',
  'Send files to editor': 'Hand the selected files to the editor.',
  'Confirm editing completed': 'Tick once the editor has returned the edited images.',
  'Review final edits': 'Quality-check the full gallery before delivery.',
  'Prepare client gallery': 'Assemble the gallery and any files for delivery.',
  'Send client gallery': 'Deliver the gallery to the client.',
  'Issue final invoice': 'Raise the final invoice for the remaining balance.',
  'Final payment received': 'Tick once the final balance is in the bank.',
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

  'Confirm shoot details': -14,
  'Send pre-shoot reminder': -7,
  'Mark shoot completed': 0,
  'Send files to editor': 2,
  'Confirm editing completed': 21,
  'Review final edits': 28,
  'Prepare client gallery': 35,
  'Send client gallery': 42,
  'Issue final invoice': 42,
  'Final payment received': 49, // a week after the final invoice
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
  'Final payment received': 'Issue final invoice',
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
  kind: string

  resolvedDueAt: Date | null

  dueAnchor: DueAnchor | null
  order: number
  completedByName: string | null
  completedAt: Date | null
}

export type BoardTaskRow = {
  id: string
  key: string | null
  title: string
  type: TaskType
  typeLabel: string
  note: string | null
  editable: boolean
  isSystem: boolean
  done: boolean
  needsAttention: boolean
  owner: string | null
  dueLabel: string | null
  dueValue: string | null
  noDate: boolean
  dueTone: DueTone
  blocked: boolean
  blockedBy: string | null
  completedByName: string | null
  completedAt: Date | null
  canComplete: boolean
  canEdit: boolean
  canDelete: boolean
}
export type BoardStage = {
  key: string
  label: string
  color: string
  optional: boolean

  custom: boolean
  active: boolean
  done: number
  total: number // money-ok: task count
  tasks: BoardTaskRow[]
}
export type NextAction =
  | { kind: 'task'; taskId: string; title: string; dueLabel: string | null; owner: string | null; needsAttention: boolean }
  | { kind: 'waiting'; label: string }
  | null
export type ProjectBoard = {
  stages: BoardStage[]
  allDone: boolean
  currentPhaseKey: string | null
  currentPhaseLabel: string | null
  progressPercent: number
  attentionCount: number
  nextAction: NextAction
}

export const ATTENTION_DAYS = 3

function isoDate(d: Date): string {
  return sydneyDateTimeParts(d).date
}

export function buildProjectBoard(
  tasks: TaskInput[],
  formatDate: (d: Date) => string,
  now: Date | null = null,
  daysUntil: (d: Date) => number = () => Number.POSITIVE_INFINITY,
  ownerName: string | null = null,
): ProjectBoard {
  const doneTitles = new Set(tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.title))

  const manualRowsFor = (stageKey: string): BoardTaskRow[] =>
    tasks
      .filter((t) => t.stage === stageKey)
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const type = (t.type as TaskType) ?? 'TODO'
        const done = t.status === 'COMPLETED'

        const dueDate: Date | null = t.resolvedDueAt
        const noDate = dueDate === null && t.dueAnchor === 'SHOOT'
        const blockedBy = PROJECT_TASK_BLOCKED_BY[t.title] ?? null

        const key = t.kind && t.kind !== CUSTOM_TASK_KIND && t.kind !== 'TASK' ? t.kind : (CORE_TASK_KEY_BY_TITLE[t.title] ?? null)
        const isCustom = key === null

        const needsAttention = !done && dueDate !== null && daysUntil(dueDate) <= ATTENTION_DAYS
        return {
          id: t.id,
          key,
          title: t.title,
          type,
          typeLabel: TASK_TYPE_LABEL[type] ?? '',
          note: PROJECT_TASK_NOTE[t.title] ?? null,
          editable: true,
          isSystem: false,
          done,
          needsAttention,
          owner: ownerName,
          dueLabel: dueDate ? formatDate(dueDate) : null,
          dueValue: dueDate ? isoDate(dueDate) : null,
          noDate,
          dueTone: dueToneFor(dueDate, done, now),
          blocked: !done && blockedBy ? !doneTitles.has(blockedBy) : false,
          blockedBy,
          completedByName: t.completedByName,
          completedAt: t.completedAt,
          canComplete: true,
          canEdit: true,
          canDelete: isCustom, // core tasks are protected from deletion; only custom tasks can be removed
        }
      })

  const coreStages: BoardStage[] = PROJECT_STAGES.map((stage) => {
    const manualRows = manualRowsFor(stage.key)
    return {
      key: stage.key,
      label: stage.label,
      color: stage.color,
      optional: stage.optional ?? false,
      custom: false,
      active: false,
      done: manualRows.filter((t) => t.done).length,
      total: manualRows.length,
      tasks: manualRows,
    }
  })

  const firstOrder = new Map<string, number>()
  for (const t of tasks) {
    if (!t.stage || PROJECT_STAGE_KEYS.has(t.stage)) continue
    const prev = firstOrder.get(t.stage)
    if (prev === undefined || t.order < prev) firstOrder.set(t.stage, t.order)
  }
  const customStages: BoardStage[] = [...firstOrder.keys()]
    .sort((a, b) => firstOrder.get(a)! - firstOrder.get(b)! || a.localeCompare(b))
    .map((key) => {
      const manualRows = manualRowsFor(key)
      return {
        key,
        label: key,
        color: 'editing',
        optional: false,
        custom: true,
        active: false,
        done: manualRows.filter((t) => t.done).length,
        total: manualRows.length,
        tasks: manualRows,
      }
    })

  const stages = [...coreStages, ...customStages]

  const manualDone = coreStages.reduce((n, s) => n + s.done, 0)
  const manualTotal = coreStages.reduce((n, s) => n + s.total, 0)
  const attentionCount = stages.reduce((n, s) => n + s.tasks.filter((t) => t.needsAttention).length, 0)
  let activeKey: string | null = null
  for (const s of coreStages) {
    if (activeKey === null && s.total > 0 && s.done < s.total) activeKey = s.key
  }
  for (const s of stages) s.active = s.key === activeKey

  const activeStage = stages.find((s) => s.key === activeKey) ?? null
  const progressPercent = manualTotal > 0 ? Math.round((manualDone / manualTotal) * 100) : 0

  let nextAction: NextAction = null
  if (activeStage) {
    const pendingManual = activeStage.tasks.filter((t) => t.editable && !t.done)
    const pick = pendingManual.find((t) => t.needsAttention) ?? pendingManual[0] ?? null
    if (pick) {
      nextAction = { kind: 'task', taskId: pick.id, title: pick.title, dueLabel: pick.dueLabel, owner: pick.owner, needsAttention: pick.needsAttention }
    } else {
      const pendingAuto = activeStage.tasks.find((t) => t.isSystem && !t.done)
      if (pendingAuto) nextAction = { kind: 'waiting', label: pendingAuto.title }
    }
  }

  return {
    stages,
    allDone: activeKey === null,
    currentPhaseKey: activeKey,
    currentPhaseLabel: activeStage?.label ?? null,
    progressPercent,
    attentionCount,
    nextAction,
  }
}
