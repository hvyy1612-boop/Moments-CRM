import { ProjectLifecycle } from '@prisma/client'
import type { StatusKind } from '@/components/ui/StatusTag'
import { CLOSED_STATUSES, COMMON_STATUSES, LIFECYCLE_KIND, LIFECYCLE_ORDER, statusLabel } from './lifecycle'

/**
 * Company-defined status labels (Monday-style "Edit Labels"). Labels are stored as JSON on
 * Company.settings, so the set can be renamed, recoloured, added to, or trimmed without a schema
 * change. The lifecycle ENUM still drives every automation (invoicing, bookings, closing a job); a
 * label with a `stage` maps onto that engine, while a custom label (`stage: null`) is a display-only
 * tag that never triggers those actions.
 */
export type StatusLabel = {
  id: string
  name: string
  color: StatusKind
  stage: ProjectLifecycle | null
  order: number
}

/** The palette a label may use - the seven brand status tones, no new colours. */
export const LABEL_COLORS: StatusKind[] = [
  'enquiry',
  'quote',
  'booked',
  'editing',
  'delivered',
  'lost',
  'hold',
]

/** The built-in set: one label per lifecycle stage, used until a company customises. */
export function defaultLabels(): StatusLabel[] {
  return LIFECYCLE_ORDER.map((stage, index) => ({
    id: stage,
    name: statusLabel(stage),
    color: LIFECYCLE_KIND[stage],
    stage,
    order: index,
  }))
}

function isStatusLabel(value: unknown): value is StatusLabel {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  const stageOk =
    o.stage === null ||
    (typeof o.stage === 'string' && (Object.values(ProjectLifecycle) as string[]).includes(o.stage))
  return (
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    typeof o.name === 'string' &&
    typeof o.color === 'string' &&
    (LABEL_COLORS as string[]).includes(o.color) &&
    stageOk &&
    typeof o.order === 'number'
  )
}

/** Read a company's labels from its settings JSON, falling back to the built-in set. */
export function labelsFromSettings(settings: unknown): StatusLabel[] {
  const raw = (settings as { statusLabels?: unknown } | null | undefined)?.statusLabels
  if (!Array.isArray(raw)) return defaultLabels()
  const cleaned = raw.filter(isStatusLabel)
  return cleaned.length > 0 ? [...cleaned].sort((a, b) => a.order - b.order) : defaultLabels()
}

/** Keep only valid labels from untrusted input (the Edit Labels form), re-numbering the order. */
export function sanitizeLabels(input: unknown): StatusLabel[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(isStatusLabel)
    .map((label, index) => ({ ...label, name: label.name.trim().slice(0, 40), order: index }))
    .filter((label) => label.name.length > 0)
}

/** The label to show for a project: its explicit custom label, else the one for its lifecycle stage. */
export function resolveLabel(
  project: { lifecycleStatus: ProjectLifecycle; statusLabelId: string | null },
  labels: StatusLabel[],
): StatusLabel {
  if (project.statusLabelId) {
    const found = labels.find((label) => label.id === project.statusLabelId)
    if (found) return found
  }
  return (
    labels.find((label) => label.stage === project.lifecycleStatus) ?? {
      id: project.lifecycleStatus,
      name: statusLabel(project.lifecycleStatus),
      color: LIFECYCLE_KIND[project.lifecycleStatus],
      stage: project.lifecycleStatus,
      order: 0,
    }
  )
}

/** A resolved label is "closed" when its stage is a closed lifecycle stage; custom labels stay open. */
export function isClosedLabel(label: StatusLabel): boolean {
  return label.stage != null && CLOSED_STATUSES.has(label.stage)
}

/** Shown up front in the picker: custom labels and the everyday stages; the rest go behind "More". */
export function isCommonLabel(label: StatusLabel): boolean {
  return label.stage == null || COMMON_STATUSES.has(label.stage)
}
