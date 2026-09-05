import { prisma } from '@/lib/db'
import { labelsFromSettings, type StatusLabel } from '@/features/projects/labels'

export async function getCompanyStatusLabels(): Promise<StatusLabel[]> {
  const company = await prisma.company.findFirst({ select: { settings: true } })
  return labelsFromSettings(company?.settings)
}

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
