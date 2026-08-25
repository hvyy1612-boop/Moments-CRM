/**
 * Project workflow (contract docs/23 + Hybrid decision). The operational layer that sits ON TOP of the
 * existing business records - it never becomes a second source of truth:
 *
 *  - Business facts (quote accepted, contract signed, deposit paid, shoot scheduled, gallery prepared /
 *    sent) are DERIVED from the real records (Quote / Contract / Invoice / Booking / Gallery). They are
 *    shown ticked automatically and are never stored as work items.
 *  - Genuine staff actions with no existing record (confirm shoot details, send reminder, send to
 *    editor, ...) are WorkItems staff complete. Each such kind belongs to a fixed workflow group here,
 *    so the board renders the correct group and position - the group is never guessed from task text.
 *
 * Pre-shoot / Shoot / Editing / Delivery are workflow GROUPS shown on the board, NOT ProjectLifecycle
 * values. The lifecycle enum is left unchanged and keeps owning the high-level business status.
 */

export type ProjectFacts = {
  quoteAccepted: boolean
  contractSigned: boolean
  depositPaid: boolean
  shootScheduled: boolean
  galleryPrepared: boolean
  gallerySent: boolean
}

type StepDef =
  | { key: string; title: string; type: 'derived'; fact: keyof ProjectFacts; hint: string }
  | { key: string; title: string; type: 'workitem'; kind: string }

type GroupDef = { key: string; label: string; steps: StepDef[] }

/** The roadmap. Ordered groups, ordered steps. Every workitem kind lives in exactly one group. */
export const PROJECT_WORKFLOW_GROUPS: GroupDef[] = [
  {
    key: 'booked',
    label: 'Booked',
    steps: [
      { key: 'quote_accepted', title: 'Quote accepted', type: 'derived', fact: 'quoteAccepted', hint: 'Client accepts the quote (Quote section)' },
      { key: 'contract_signed', title: 'Contract signed', type: 'derived', fact: 'contractSigned', hint: 'Client signs the contract (Contract section)' },
      { key: 'deposit_paid', title: 'Booking payment received', type: 'derived', fact: 'depositPaid', hint: 'Record the payment (Invoices and payments)' },
    ],
  },
  {
    key: 'preshoot',
    label: 'Pre-shoot',
    steps: [
      { key: 'confirm_shoot_details', title: 'Confirm shoot details', type: 'workitem', kind: 'CONFIRM_SHOOT_DETAILS' },
      { key: 'send_preshoot_reminder', title: 'Send pre-shoot reminder', type: 'workitem', kind: 'SEND_PRESHOOT_REMINDER' },
    ],
  },
  {
    key: 'shoot',
    label: 'Shoot',
    steps: [
      { key: 'shoot_scheduled', title: 'Shoot scheduled', type: 'derived', fact: 'shootScheduled', hint: 'Schedule the shoot (Scheduling section)' },
      { key: 'shoot_completed', title: 'Mark shoot completed', type: 'workitem', kind: 'MARK_SHOOT_COMPLETED' },
    ],
  },
  {
    key: 'editing',
    label: 'Editing',
    steps: [
      { key: 'send_to_editor', title: 'Send photos to editor', type: 'workitem', kind: 'SEND_TO_EDITOR' },
      { key: 'editing_completed', title: 'Editing completed', type: 'workitem', kind: 'EDITING_COMPLETED' },
      { key: 'review_edits', title: 'Review edited photos', type: 'workitem', kind: 'REVIEW_EDITS' },
    ],
  },
  {
    key: 'delivery',
    label: 'Delivery',
    steps: [
      { key: 'gallery_prepared', title: 'Prepare final gallery', type: 'derived', fact: 'galleryPrepared', hint: 'Create the gallery (Delivery section)' },
      { key: 'gallery_sent', title: 'Send gallery to client', type: 'derived', fact: 'gallerySent', hint: 'Publish the gallery (Delivery section)' },
    ],
  },
]

/** kind -> title and kind -> group, built once from the template. */
export const PROJECT_WORK_ITEM_TITLE: Record<string, string> = {}
const PROJECT_KIND_GROUP: Record<string, string> = {}
for (const group of PROJECT_WORKFLOW_GROUPS) {
  for (const step of group.steps) {
    if (step.type === 'workitem') {
      PROJECT_WORK_ITEM_TITLE[step.kind] = step.title
      PROJECT_KIND_GROUP[step.kind] = group.key
    }
  }
}

export const PROJECT_WORKITEM_KINDS: ReadonlySet<string> = new Set(Object.keys(PROJECT_WORK_ITEM_TITLE))

export function projectWorkItemTitle(kind: string): string {
  return PROJECT_WORK_ITEM_TITLE[kind] ?? kind
}

export function projectWorkItemGroup(kind: string): string | null {
  return PROJECT_KIND_GROUP[kind] ?? null
}

export type ProjectBoardStep = {
  key: string
  title: string
  type: 'derived' | 'workitem'
  kind: string | null
  state: 'done' | 'current' | 'todo'
  tickable: boolean
  hint: string | null
  completedByName: string | null
  completedAt: Date | null
}

export type ProjectBoardGroup = { key: string; label: string; active: boolean; steps: ProjectBoardStep[] }

export type CompletedWorkItem = { name: string | null; at: Date | null }

export type ProjectBoard = {
  groups: ProjectBoardGroup[]
  activeGroupKey: string | null
  /** The current tickable staff action, if the current step is a work item. */
  currentKind: string | null
  currentTitle: string | null
  /** Set when the current step is a derived business fact staff must produce elsewhere. */
  currentHint: string | null
  allDone: boolean
}

/**
 * Build the board purely from backend data: derived facts + the set of completed work items. The
 * "current" step is the first step (in template order) that is not yet done; its group is the active
 * group. A work item is only tickable when it is that current step.
 */
export function buildProjectBoard(
  facts: ProjectFacts,
  completed: Map<string, CompletedWorkItem>,
): ProjectBoard {
  const flat: { groupKey: string; step: StepDef; done: boolean }[] = []
  for (const group of PROJECT_WORKFLOW_GROUPS) {
    for (const step of group.steps) {
      const done = step.type === 'derived' ? facts[step.fact] : completed.has(step.kind)
      flat.push({ groupKey: group.key, step, done })
    }
  }

  const currentIndex = flat.findIndex((s) => !s.done)
  const allDone = currentIndex === -1
  const current = allDone ? null : flat[currentIndex]!
  const activeGroupKey = current
    ? current.groupKey
    : (PROJECT_WORKFLOW_GROUPS[PROJECT_WORKFLOW_GROUPS.length - 1]?.key ?? null)

  let flatCursor = 0
  const groups: ProjectBoardGroup[] = PROJECT_WORKFLOW_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    active: group.key === activeGroupKey,
    steps: group.steps.map((step) => {
      const index = flatCursor++
      const entry = flat[index]!
      const isCurrent = index === currentIndex
      const state: ProjectBoardStep['state'] = entry.done ? 'done' : isCurrent ? 'current' : 'todo'
      const meta = step.type === 'workitem' ? completed.get(step.kind) : undefined
      return {
        key: step.key,
        title: step.title,
        type: step.type,
        kind: step.type === 'workitem' ? step.kind : null,
        state,
        tickable: isCurrent && step.type === 'workitem',
        hint: isCurrent && step.type === 'derived' ? step.hint : null,
        completedByName: meta?.name ?? null,
        completedAt: meta?.at ?? null,
      }
    }),
  }))

  return {
    groups,
    activeGroupKey,
    currentKind: current && current.step.type === 'workitem' ? current.step.kind : null,
    currentTitle: current?.step.title ?? null,
    currentHint: current && current.step.type === 'derived' ? current.step.hint : null,
    allDone,
  }
}
