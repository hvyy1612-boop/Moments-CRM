
export const WORK_ITEM_TITLE: Record<string, string> = {
  REVIEW_ENQUIRY: 'Review enquiry',
  REPLY_TO_CLIENT: 'Reply to client',
  REVIEW_CLIENT_REPLY: 'Review client reply',
  PREPARE_QUOTE: 'Prepare quote',
  SEND_QUOTE: 'Send quote',
}

export const TICKABLE_KINDS = new Set([
  'REVIEW_ENQUIRY',
  'REVIEW_CLIENT_REPLY',
  'PREPARE_QUOTE',
  'SEND_QUOTE',
])

export function workItemTitle(kind: string): string {
  return WORK_ITEM_TITLE[kind] ?? kind
}

export function currentActionText(waitingOn: string | null, pendingTitle: string | null): string {
  if (waitingOn === 'CLIENT') return 'Waiting for client reply'
  if (pendingTitle) return `Staff needs to: ${pendingTitle.toLowerCase()}`
  if (waitingOn === 'STUDIO') return 'Staff needs to act'
  return '-'
}

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

  workItemId: string | null
  completedByName: string | null
  completedAt: Date | null
}

export type BoardStage = { key: string; label: string; active: boolean; steps: BoardStep[] }

export type WorkflowBoard = {
  stages: BoardStage[]

  pendingKind: string | null
  pendingId: string | null
}

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
