
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
