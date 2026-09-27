/**
 * Project workflow (job phase), editable per project. Fixed coloured stages carry the Moments process;
 * tasks inside are editable WorkItem rows and carry a type (To-do / Auto email / Appointment / Shoot /
 * Auto). AUTO rows are system-driven: their done state is read from the real records (gallery sent,
 * final payment), not toggled by staff. Optional stages (Pre-wedding, Video, Film, Album) are not
 * seeded by default; staff add their tasks per package.
 */
import { dueToneFor, TASK_TYPE_LABEL, type DueTone, type TaskType } from '@/features/enquiries/workflow'
import type { DueAnchor } from '@/lib/domain/deadline'

export { ADDABLE_TASK_TYPES } from '@/features/enquiries/workflow'
export type { TaskType } from '@/features/enquiries/workflow'

export type ProjectFacts = { shootScheduled: boolean; gallerySent: boolean; finalPaid: boolean; deliveryComplete: boolean }

type StageDef = { key: string; label: string; color: string; optional?: boolean }

// Stage labels use full, medium-neutral industry terms (they cover photo AND video - this is a photo &
// film studio, not photo-only) with no abbreviations, so any staff member reads the phase at a glance.
// Keys never change - renaming a label needs no data migration.
// A Job exists only AFTER booking, so the Job workflow is the PRODUCTION lifecycle only. Sales/booking
// (planning, quote, contract, deposit) live in the Enquiry phase and are never repeated here.
// Flow: Pre-shoot -> Shoot -> Editing -> Delivery -> Complete. Optional add-on stages stay available.
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

/**
 * Read-only SYSTEM milestones shown inside the workflow (not staff tasks, not WorkItems in the DB): their
 * done-state is derived from real records via ProjectFacts, so staff can see them but can never tick them
 * and they never drift out of sync. buildProjectBoard injects these virtual rows into their stage.
 */
export const AUTO_MILESTONES: { stage: string; title: string; fact: keyof ProjectFacts; note: string }[] = [
  { stage: 'shoot', title: 'Shoot scheduled', fact: 'shootScheduled', note: 'Confirmed automatically once a shoot date is booked.' },
  { stage: 'delivery', title: 'Final payment received', fact: 'finalPaid', note: 'Confirmed automatically when the balance is paid in full.' },
  { stage: 'delivery', title: 'Delivery complete', fact: 'deliveryComplete', note: 'Confirmed automatically once the gallery is delivered and paid.' },
]

/** The production workflow seeded for a new Job: staff (manual) tasks only, action-oriented names
 *  (Verb + Object). System milestones (Shoot scheduled / Final payment received / Delivery complete) are
 *  NOT seeded here - they are read-only rows derived from real records (see AUTO_MILESTONES). Optional
 *  add-on stages (video/film/album) start empty and are added per package. */
export const DEFAULT_PROJECT_TASKS: { stage: string; title: string; type: TaskType }[] = [
  { stage: 'preshoot', title: 'Confirm shoot details', type: 'TODO' },
  { stage: 'preshoot', title: 'Send pre-shoot reminder', type: 'TODO' },

  { stage: 'shoot', title: 'Mark shoot completed', type: 'SHOOT' },

  { stage: 'editing', title: 'Send files to editor', type: 'TODO' },
  { stage: 'editing', title: 'Confirm editing completed', type: 'TODO' },
  { stage: 'editing', title: 'Review final edits', type: 'TODO' },

  { stage: 'delivery', title: 'Prepare client gallery', type: 'TODO' },
  { stage: 'delivery', title: 'Send client gallery', type: 'TODO' },
  { stage: 'delivery', title: 'Issue final invoice', type: 'TODO' },
]

/** Tasks inserted when staff adds an optional stage block (per package). */
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

/** A short, formal note under each default and optional task - what it is and when it is done. */
export const PROJECT_TASK_NOTE: Record<string, string> = {
  'Confirm shoot details': 'Lock the date, timeline, locations, and key people with the client.',
  'Send pre-shoot reminder': 'Remind the client of the details shortly before the shoot.',
  'Mark shoot completed': 'Tick once the shoot has been photographed and filmed.',
  'Send files to editor': 'Hand the selected files to the editor.',
  'Confirm editing completed': 'Tick once the editor has returned the edited images.',
  'Review final edits': 'Quality-check the full gallery before delivery.',
  'Prepare client gallery': 'Assemble the gallery and any files for delivery.',
  'Send client gallery': 'Deliver the gallery to the client.',
  'Issue final invoice': 'Raise the final invoice for the remaining balance.',
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
  // Optional stages
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

/** Relative due date for each project task: days from the shoot date (negative = before the shoot). */
export const PROJECT_TASK_SCHEDULE: Record<string, number> = {
  // Production workflow (shoot-anchored: negative = days before the shoot).
  'Confirm shoot details': -14,
  'Send pre-shoot reminder': -7,
  'Mark shoot completed': 0,
  'Send files to editor': 2,
  'Confirm editing completed': 21,
  'Review final edits': 28,
  'Prepare client gallery': 35,
  'Send client gallery': 42,
  'Issue final invoice': 42,
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
  // Optional stages
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

/** Which task must be done before another can start (a light dependency, matched by title). */
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
  /** Effective due date, already resolved by resolveTaskDueDate (docs/25 Part 2, Rule D0). */
  resolvedDueAt: Date | null
  /** The task's anchor, so the board can tell "awaiting a shoot" apart from "no date". */
  dueAnchor: DueAnchor | null
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
  now: Date | null = null,
): ProjectBoard {
  const doneTitles = new Set(tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.title))
  let activeKey: string | null = null
  const stages: BoardStage[] = PROJECT_STAGES.map((stage) => {
    // Manual staff tasks for this stage (every seeded/added WorkItem is a manual task).
    const manualRows: BoardTaskRow[] = tasks
      .filter((t) => t.stage === stage.key)
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const type = (t.type as TaskType) ?? 'TODO'
        const done = t.status === 'COMPLETED'
        // Due date is resolved upstream by resolveTaskDueDate (Rule D0). A shoot-anchored task with no
        // shoot yet resolves to null → show "no date yet" rather than treating it as overdue.
        const dueDate: Date | null = t.resolvedDueAt
        const noDate = dueDate === null && t.dueAnchor === 'SHOOT'
        const blockedBy = PROJECT_TASK_BLOCKED_BY[t.title] ?? null
        return {
          id: t.id,
          title: t.title,
          type,
          typeLabel: TASK_TYPE_LABEL[type] ?? '',
          note: PROJECT_TASK_NOTE[t.title] ?? null,
          editable: true,
          done,
          dueLabel: dueDate ? formatDate(dueDate) : null,
          dueValue: dueDate ? isoDate(dueDate) : null,
          noDate,
          dueTone: dueToneFor(dueDate, done, now),
          blocked: !done && blockedBy ? !doneTitles.has(blockedBy) : false,
          blockedBy,
          completedByName: t.completedByName,
          completedAt: t.completedAt,
        }
      })
    // Read-only SYSTEM milestones for this stage (virtual - not WorkItems); done-state from real facts.
    const autoRows: BoardTaskRow[] = AUTO_MILESTONES.filter((m) => m.stage === stage.key).map((m) => ({
      id: `auto:${stage.key}:${m.title}`,
      title: m.title,
      type: 'AUTO' as TaskType,
      typeLabel: TASK_TYPE_LABEL.AUTO ?? 'Auto',
      note: m.note,
      editable: false,
      done: facts[m.fact],
      dueLabel: null,
      dueValue: null,
      noDate: false,
      dueTone: dueToneFor(null, facts[m.fact], now),
      blocked: false,
      blockedBy: null,
      completedByName: facts[m.fact] ? 'System' : null,
      completedAt: null,
    }))
    // Count + active phase use MANUAL tasks only: an auto milestone must not move the phase forward or
    // inflate the staff-work count (a shoot may be scheduled while pre-shoot work is still pending).
    const done = manualRows.filter((t) => t.done).length
    const total = manualRows.length
    if (total > 0 && done < total && activeKey === null) activeKey = stage.key
    return {
      key: stage.key,
      label: stage.label,
      color: stage.color,
      optional: stage.optional ?? false,
      active: false,
      done,
      total,
      tasks: [...manualRows, ...autoRows],
    }
  })
  for (const s of stages) s.active = s.key === activeKey
  return { stages, allDone: activeKey === null }
}
