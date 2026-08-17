'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { Field, TextInput } from '@/components/ui/form'
import {
  addGalleryItemAction,
  createGalleryAction,
  publishGalleryAction,
  type QuoteActionState,
} from '../actions'

const IDLE: QuoteActionState = { status: 'idle' }

const GALLERY_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'good',
  ARCHIVED: 'neutral',
}

export type GalleryItemView = { id: string; caption: string; url: string }
export type GalleryView = {
  id: string
  title: string
  status: string
  accessToken: string
  publishedLabel: string | null
  items: GalleryItemView[]
}

function ItemList({ items }: { items: GalleryItemView[] }) {
  if (items.length === 0) return <p className="text-sm text-ink-muted">No items yet.</p>
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0"
        >
          <span className="text-ink">{item.caption}</span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            View
          </a>
        </li>
      ))}
    </ul>
  )
}

function CreateGalleryForm({ csrf, projectId }: { csrf: string; projectId: string }) {
  const [state, action, pending] = useActionState(createGalleryAction, IDLE)
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-sm text-ink-muted">Prepare the finished work to hand over to the client.</p>
      <Field label="Gallery title" htmlFor="galleryTitle">
        <TextInput id="galleryTitle" name="title" placeholder="Wedding gallery" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Start gallery
        </Button>
      </div>
    </form>
  )
}

function AddItemForm({
  csrf,
  projectId,
  galleryId,
}: {
  csrf: string
  projectId: string
  galleryId: string
}) {
  const [state, action, pending] = useActionState(addGalleryItemAction, IDLE)
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="galleryId" value={galleryId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-4">
          <TextInput name="caption" aria-label="Item caption" placeholder="Caption" />
        </div>
        <div className="sm:col-span-6">
          <TextInput name="url" aria-label="Item link" inputMode="url" placeholder="https://..." />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" size="sm" loading={pending} className="w-full">
            Add item
          </Button>
        </div>
      </div>
    </form>
  )
}

export function Delivery({
  csrf,
  projectId,
  gallery,
}: {
  csrf: string
  projectId: string
  gallery: GalleryView | null
}) {
  if (!gallery) {
    return <CreateGalleryForm csrf={csrf} projectId={projectId} />
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ink">{gallery.title}</p>
        <StatusPill tone={GALLERY_TONE[gallery.status] ?? 'neutral'}>
          {gallery.status.toLowerCase()}
        </StatusPill>
      </div>

      <ItemList items={gallery.items} />

      {gallery.status === 'DRAFT' ? (
        <>
          <AddItemForm csrf={csrf} projectId={projectId} galleryId={gallery.id} />
          <form action={publishGalleryAction} className="border-t border-line pt-3">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="galleryId" value={gallery.id} />
            <p className="text-sm text-ink-muted">
              Publishing delivers the gallery to the client and completes the project.
            </p>
            <Button type="submit" className="mt-2">
              Publish to client
            </Button>
          </form>
        </>
      ) : (
        <div className="border-t border-line pt-3">
          <p className="text-sm text-ink">
            {gallery.publishedLabel ? `Delivered on ${gallery.publishedLabel}.` : 'Delivered.'}
          </p>
          <p className="mt-1 text-sm">
            Client link: <span className="text-ink">/gallery/{gallery.accessToken}</span>
          </p>
        </div>
      )}
    </div>
  )
}
