import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import type { AddGalleryItemInput, CreateGalleryInput } from '@/lib/validation/delivery'
import { maybeAutoCompleteJob } from './project-workflow'

/**
 * Delivery. Once a project is confirmed, staff prepare a gallery of the finished work and publish it
 * to the client by token. Creating the gallery moves the project into production; publishing it marks
 * the project completed. Object storage, revisions and approvals are a later slice; items hold an
 * external link for now.
 */

const POST_CONFIRMATION = ['CONFIRMED', 'IN_PRODUCTION', 'COMPLETED']

/** Start a draft gallery for a confirmed project and move it into production. */
export async function createGallery(
  projectId: string,
  input: CreateGalleryInput,
  actorUserId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, lifecycleStatus: true },
    })
    if (!project) throw new Error('Project not found.')
    if (!POST_CONFIRMATION.includes(project.lifecycleStatus)) {
      throw new Error('Confirm the project (sign the contract) before preparing delivery.')
    }

    const gallery = await tx.gallery.create({
      data: {
        projectId,
        title: input.title,
        status: 'DRAFT',
        accessToken: randomBytes(24).toString('base64url'),
      },
    })
    if (project.lifecycleStatus === 'CONFIRMED') {
      await tx.project.update({
        where: { id: projectId },
        data: { lifecycleStatus: 'IN_PRODUCTION' },
      })
    }
    await tx.auditLog.create({
      data: {
        action: 'gallery.created',
        entityType: 'Gallery',
        entityId: gallery.id,
        actorUserId,
        afterData: { projectId },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'gallery.created',
        aggregateType: 'Gallery',
        aggregateId: gallery.id,
        payload: { galleryId: gallery.id, projectId },
      },
    })
    return gallery
  })
}

/** Add an item (caption + external link) to a draft gallery. */
export async function addGalleryItem(
  galleryId: string,
  input: AddGalleryItemInput,
  actorUserId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const gallery = await tx.gallery.findUnique({
      where: { id: galleryId },
      select: { id: true, status: true },
    })
    if (!gallery) throw new Error('Gallery not found.')
    if (gallery.status !== 'DRAFT') throw new Error('This gallery has already been published.')

    const count = await tx.galleryItem.count({ where: { galleryId } })
    const item = await tx.galleryItem.create({
      data: { galleryId, caption: input.caption, url: input.url, sortOrder: count },
    })
    await tx.auditLog.create({
      data: {
        action: 'gallery.item_added',
        entityType: 'GalleryItem',
        entityId: item.id,
        actorUserId,
      },
    })
    return item
  })
}

/** Publish a gallery to the client and mark the project completed. Needs at least one item. */
export async function publishGallery(galleryId: string, actorUserId: string | null) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const gallery = await tx.gallery.findUnique({
      where: { id: galleryId },
      select: { id: true, projectId: true, status: true, _count: { select: { items: true } } },
    })
    if (!gallery) throw new Error('Gallery not found.')
    if (gallery.status !== 'DRAFT') throw new Error('This gallery has already been published.')
    if (gallery._count.items === 0) throw new Error('Add at least one item before publishing.')

    await tx.gallery.update({
      where: { id: galleryId },
      data: { status: 'PUBLISHED', publishedAt: now },
    })
    // Publishing a gallery is a delivery FACT, not a completion command. Defer to the guarded resolver
    // (all tasks done AND fully settled AND still an active job) so a cancelled job is never resurrected
    // and an unpaid one is not marked complete (bug #1).
    await maybeAutoCompleteJob(tx, gallery.projectId, actorUserId)
    await tx.auditLog.create({
      data: {
        action: 'gallery.published',
        entityType: 'Gallery',
        entityId: galleryId,
        actorUserId,
        source: 'staff.delivery',
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'gallery.published',
        aggregateType: 'Gallery',
        aggregateId: galleryId,
        payload: { galleryId, projectId: gallery.projectId },
      },
    })
    return { published: true }
  })
}
