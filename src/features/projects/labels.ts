import { ProjectLifecycle } from '@prisma/client'
import type { StatusKind } from '@/components/ui/StatusTag'
import { CLOSED_STATUSES, COMMON_STATUSES, LIFECYCLE_KIND, LIFECYCLE_ORDER, statusLabel } from './lifecycle'

export type StatusLabel = {
  id: string
  name: string
  color: StatusKind
  stage: ProjectLifecycle | null
  order: number
}

export const LABEL_COLORS: StatusKind[] = [
  'enquiry',
  'quote',
  'booked',
  'editing',
  'delivered',
  'lost',
  'hold',
]

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

export function labelsFromSettings(settings: unknown): StatusLabel[] {
  const raw = (settings as { statusLabels?: unknown } | null | undefined)?.statusLabels
  if (!Array.isArray(raw)) return defaultLabels()
  const cleaned = raw.filter(isStatusLabel)
  return cleaned.length > 0 ? [...cleaned].sort((a, b) => a.order - b.order) : defaultLabels()
}

export function sanitizeLabels(input: unknown): StatusLabel[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(isStatusLabel)
    .map((label, index) => ({ ...label, name: label.name.trim().slice(0, 40), order: index }))
    .filter((label) => label.name.length > 0)
}

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

export function isClosedLabel(label: StatusLabel): boolean {
  return label.stage != null && CLOSED_STATUSES.has(label.stage)
}

export function isCommonLabel(label: StatusLabel): boolean {
  return label.stage == null || COMMON_STATUSES.has(label.stage)
}
