/**
 * Work-item vocabulary for the enquiry workflow (contract docs/23). One title per kind, shared by the
 * backend (which creates the items) and the UI (which renders them). No workflow logic lives here.
 */
export const WORK_ITEM_TITLE: Record<string, string> = {
  REVIEW_ENQUIRY: 'Review enquiry',
  REPLY_TO_CLIENT: 'Reply to client',
  REVIEW_CLIENT_REPLY: 'Review client reply',
  PREPARE_QUOTE: 'Prepare quote',
  SEND_QUOTE: 'Send quote',
}

/** Kinds completed by a plain tick (a staff task with no message). REPLY_TO_CLIENT is completed by
 * sending a reply instead, so it is not in this set. */
export const TICKABLE_KINDS = new Set([
  'REVIEW_ENQUIRY',
  'REVIEW_CLIENT_REPLY',
  'PREPARE_QUOTE',
  'SEND_QUOTE',
])

export function workItemTitle(kind: string): string {
  return WORK_ITEM_TITLE[kind] ?? kind
}

/** The one-line "what to do now" shown in the queue and case header, derived from backend state. */
export function currentActionText(waitingOn: string | null, pendingTitle: string | null): string {
  if (waitingOn === 'CLIENT') return 'Waiting for client reply'
  if (pendingTitle) return `Staff needs to: ${pendingTitle.toLowerCase()}`
  if (waitingOn === 'STUDIO') return 'Staff needs to act'
  return '-'
}

/**
 * The workflow roadmap: the fixed set of stages and the milestone tasks inside each one. This is the
 * shape shown on the case detail board. It mirrors what the backend transitions actually produce -
 * every kind here is a kind the backend creates and handles - so the board never shows a step staff
 * cannot reach. Repeated back-and-forth (reply -> client reply -> reply) collapses onto the same
 * milestone; the running detail lives in the Conversation panel, not here.
 */
export const WORKFLOW_STAGES: { key: string; label: string; status: string; kinds: string[] }[] = [
  { key: 'new', label: 'New enquiry', status: 'NEW', kinds: ['REVIEW_ENQUIRY', 'REPLY_TO_CLIENT'] },
  { key: 'discussing', label: 'Discussing details', status: 'CONTACTED', kinds: ['REVIEW_CLIENT_REPLY'] },
  { key: 'quote', label: 'Preparing quote', status: 'QUALIFIED', kinds: ['PREPARE_QUOTE', 'SEND_QUOTE'] },
]

const STATUS_TO_STAGE_KEY: Record<string, string> = {
  NEW: 'new',
  CONTACTED: 'discussing',
  QUALIFIED: 'quote',
  CONVERTED: 'booked',
}

export type WorkItemLite = {
  id: string
  kind: string
  status: string
  completedAt: Date | null
  completedByName: string | null
}

export type BoardStepState = 'done' | 'current' | 'todo'

export type BoardStep = {
  kind: string
  title: string
  state: BoardStepState
  tickable: boolean
  /** Set only when state is 'current': the pending work item to complete. */
  workItemId: string | null
  completedByName: string | null
  completedAt: Date | null
}

export type BoardStage = { key: string; label: string; active: boolean; steps: BoardStep[] }

export type WorkflowBoard = {
  stages: BoardStage[]
  /** The single work item awaiting action, if any. */
  pendingKind: string | null
  pendingId: string | null
}

/**
 * Build the board from real backend state - never invents a step or a status. A step is:
 *  - current  if the enquiry's one pending work item is of that kind,
 *  - done     if a completed work item of that kind exists (most recent shows who/when),
 *  - todo     otherwise (not started yet).
 */
export function buildWorkflowBoard(
  status: string,
  workItems: WorkItemLite[],
): WorkflowBoard {
  const pending = workItems.find((w) => w.status === 'PENDING') ?? null
  const activeKey = STATUS_TO_STAGE_KEY[status] ?? null

  const stages: BoardStage[] = WORKFLOW_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    active: stage.key === activeKey,
    steps: stage.kinds.map((kind) => {
      const done = workItems
        .filter((w) => w.kind === kind && w.status === 'COMPLETED')
        .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
      const latest = done[0]
      const isCurrent = pending?.kind === kind
      const state: BoardStepState = isCurrent ? 'current' : latest ? 'done' : 'todo'
      return {
        kind,
        title: workItemTitle(kind),
        state,
        tickable: TICKABLE_KINDS.has(kind),
        workItemId: isCurrent ? pending!.id : null,
        completedByName: latest?.completedByName ?? null,
        completedAt: latest?.completedAt ?? null,
      }
    }),
  }))

  return { stages, pendingKind: pending?.kind ?? null, pendingId: pending?.id ?? null }
}
