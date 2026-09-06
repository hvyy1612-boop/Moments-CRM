// UI PREVIEW mapping (presentation-only, NOT persisted). Defines which milestone each enquiry task is
// completed at, so picking a stage can cascade-tick every task up to that stage. Canonical enum values,
// task order and the backend are unchanged - this only drives the local preview on the Enquiries list.

export const STAGE_ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'] as const

/** The stage at which each default task is considered done. Cumulative: reaching a stage ticks it and
 *  everything before it. Custom tasks fall back to their board-stage (quote -> Quote sent, else Contacted). */
const TASK_MILESTONE: Record<string, string> = {
  'Enquiry received': 'NEW',
  'Send initial enquiry response': 'CONTACTED',
  'Follow up on enquiry': 'CONTACTED',
  'Discuss shoot requirements': 'CONTACTED',
  'Schedule client consultation': 'CONTACTED',
  'Confirm shoot date and requirements': 'CONTACTED',
  'Prepare client quote': 'QUALIFIED',
  'Send client quote': 'QUALIFIED',
  'Follow up on quote': 'QUALIFIED',
  'Update quote based on client request': 'QUALIFIED',
  'Send contract and deposit invoice': 'CONVERTED',
}

const ORDER = STAGE_ORDER as readonly string[]

function stageIndex(status: string): number {
  return ORDER.indexOf(status)
}

function taskStageIndex(task: { title: string; stage: string | null }): number {
  const milestone = TASK_MILESTONE[task.title] ?? (task.stage === 'quote' ? 'QUALIFIED' : 'CONTACTED')
  return ORDER.indexOf(milestone)
}

export type RowTask = { id: string; title: string; stage: string | null; done: boolean }

/**
 * Effective task completion for the preview cascade. When a stage is being previewed (and it is one of
 * the ordered open/booked stages), every task at or before that stage reads ticked; a manual per-task
 * override wins over the cascade. With no preview, the real backend completion is used. Purely visual.
 */
export function deriveTasks(
  tasks: RowTask[],
  previewStage: string | null,
  overrides: Record<string, boolean>,
): { id: string; title: string; done: boolean }[] {
  const cascade = previewStage != null && stageIndex(previewStage) !== -1
  const target = previewStage != null ? stageIndex(previewStage) : -1
  return tasks.map((t) => {
    let done = t.done
    if (cascade) done = taskStageIndex(t) <= target
    if (Object.prototype.hasOwnProperty.call(overrides, t.id)) done = overrides[t.id]!
    return { id: t.id, title: t.title, done }
  })
}
