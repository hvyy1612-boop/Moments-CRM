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
 * Set a project's display status label. This is PRESENTATION ONLY (docs/24 FIX 10): it changes the
 * displayed tag and never the lifecycle, commercial state, workflow or booking. Business state moves
 * only through domain commands. Records an audit row; a no-op when the label is unchanged.
 */
export async function setProjectStatusByLabel(projectId: string, labelId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, companyId: true, statusLabelId: true },
    })
    if (!project) throw new Error('Project not found.')

    const company = await tx.company.findUnique({
      where: { id: project.companyId },
      select: { settings: true },
    })
    const label = labelsFromSettings(company?.settings).find((l) => l.id === labelId)
    if (!label) throw new Error('Unknown status label.')

    if (project.statusLabelId === label.id) return project

    const updated = await tx.project.update({
      where: { id: projectId },
      data: { statusLabelId: label.id }, // NEVER lifecycleStatus - a label cannot move business state.
      select: { id: true },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.label_changed',
        entityType: 'Project',
        entityId: projectId,
        source: 'staff.board',
        beforeData: { statusLabelId: project.statusLabelId },
        afterData: { statusLabelId: label.id },
      },
    })
    return updated
  })
}
