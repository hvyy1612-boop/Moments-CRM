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
