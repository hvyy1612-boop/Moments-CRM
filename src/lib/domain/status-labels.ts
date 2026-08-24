import type { ProjectLifecycle } from '@prisma/client'
import { prisma } from '@/lib/db'
import { labelsFromSettings, type StatusLabel } from '@/features/projects/labels'

/**
 * Company status labels live on Company.settings.statusLabels (JSON). This app is single-tenant, so
 * the one company row holds the shared label set. The lifecycle enum still drives automation; these
 * helpers only manage the display labels and which one a project points at.
 */
export async function getCompanyStatusLabels(): Promise<StatusLabel[]> {
  const company = await prisma.company.findFirst({ select: { settings: true } })
  return labelsFromSettings(company?.settings)
}

/** Persist a curated label set (already sanitised) onto the company settings JSON. */
export async function saveCompanyStatusLabels(labels: StatusLabel[]): Promise<void> {
  const company = await prisma.company.findFirst({ select: { id: true, settings: true } })
  if (!company) throw new Error('No company row exists.')
  const settings =
    company.settings && typeof company.settings === 'object' && !Array.isArray(company.settings)
      ? (company.settings as Record<string, unknown>)
      : {}
  await prisma.company.update({
    where: { id: company.id },
    data: { settings: { ...settings, statusLabels: labels } },
  })
}

/**
 * Move a project to a status label. A built-in label (with a `stage`) also advances the lifecycle
 * enum so automation keeps working; a custom label only changes the displayed tag. Records an audit
 * row; a no-op when nothing changes.
 */
export async function setProjectStatusByLabel(projectId: string, labelId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, companyId: true, lifecycleStatus: true, statusLabelId: true },
    })
    if (!project) throw new Error('Project not found.')

    const company = await tx.company.findUnique({
      where: { id: project.companyId },
      select: { settings: true },
    })
    const label = labelsFromSettings(company?.settings).find((l) => l.id === labelId)
    if (!label) throw new Error('Unknown status label.')

    const nextStage: ProjectLifecycle = label.stage ?? project.lifecycleStatus
    if (project.statusLabelId === label.id && project.lifecycleStatus === nextStage) return project

    const updated = await tx.project.update({
      where: { id: projectId },
      data: { statusLabelId: label.id, lifecycleStatus: nextStage },
      select: { id: true },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.status_changed',
        entityType: 'Project',
        entityId: projectId,
        source: 'staff.board',
        beforeData: { lifecycleStatus: project.lifecycleStatus, statusLabelId: project.statusLabelId },
        afterData: { lifecycleStatus: nextStage, statusLabelId: label.id },
      },
    })
    return updated
  })
}
