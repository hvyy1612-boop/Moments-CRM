import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { StatusTag } from '@/components/ui/StatusTag'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/form'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate, formatSydneyDateTime } from '@/lib/time'
import {
  ENQUIRY_STAGE_KIND,
  ENQUIRY_STAGE_LABEL,
  isOpenEnquiry,
  waitingLabel,
} from '@/features/enquiries/status'
import { getEnquiryBoard } from '@/lib/domain/enquiry-workflow'
import { AppShell } from '../../AppShell'
import {
  convertEnquiryAction,
  logClientReplyAction,
  sendReplyAction,
  updateEnquiryAction,
} from '../actions'
import { EnquiryWorkflow } from './EnquiryWorkflow'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Enquiry - Moments' }

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default async function EnquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  const user = await requireRole('/enquiries/[id]')
  const { id } = await params
  const { back } = await searchParams
  const backHref = back ? `/enquiries?${back}` : '/enquiries'
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const enquiry = await prisma.enquiry.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      eventType: true,
      eventDate: true,
      message: true,
      partnerName: true,
      coverage: true,
      gettingReadyLocation: true,
      ceremonyLocation: true,
      guestCount: true,
      styleReason: true,
      heardAbout: true,
      status: true,
      waitingOn: true,
      convertedProjectId: true,
      communications: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, direction: true, body: true, createdAt: true, by: { select: { name: true } } },
      },
    },
  })
  // /enquiries/[id] loads the Enquiry entity ONLY - it never guesses a Project id (docs/24 FIX 11).
  if (!enquiry) notFound()

  const activity = await prisma.auditLog.findMany({
    where: { entityType: 'Enquiry', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
  })

  const open = isOpenEnquiry(enquiry.status)
  const board = await getEnquiryBoard(id)

  return (
    <AppShell user={user} csrf={csrf} active="enquiries" bareHeader>
      <div className="w-full">
        <Link href={backHref} className="inline-flex items-center gap-0.5 text-sm text-ink-muted transition-colors hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Enquiries
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-ink">{enquiry.name}</h1>
          <StatusTag kind={ENQUIRY_STAGE_KIND[enquiry.status] ?? 'hold'}>
            {ENQUIRY_STAGE_LABEL[enquiry.status] ?? titleCase(enquiry.status)}
          </StatusTag>
        </div>
        <p className="mt-1 text-base text-ink-muted">
          {enquiry.eventType ? titleCase(enquiry.eventType) : 'Enquiry'}
          {open ? (
            <>
              {' · Waiting for: '}
              <span className="font-bold text-ink">{waitingLabel(enquiry.waitingOn)}</span>
            </>
          ) : null}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Workflow */}
          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Workflow</h2>

            {enquiry.status === 'CONVERTED' ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-md bg-paper p-3 text-sm text-ink-muted">
                  Booked - the enquiry checklist is complete. Open the job below to continue the work.
                </div>
                <EnquiryWorkflow
                  stages={board.stages}
                  allDone={board.allDone}
                  enquiryId={enquiry.id}
                  csrf={csrf}
                  readOnly
                />
              </div>
            ) : (
              <EnquiryWorkflow
                stages={board.stages}
                allDone={board.allDone}
                enquiryId={enquiry.id}
                csrf={csrf}
              />
            )}

            {/* Outcomes */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {open ? (
                <>
                  <form action={convertEnquiryAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="enquiryId" value={enquiry.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-sunk"
                    >
                      Create Job
                    </button>
                  </form>
                  <form action={updateEnquiryAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="enquiryId" value={enquiry.id} />
                    <input type="hidden" name="op" value="lost" />
                    <button
                      type="submit"
                      className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-bold text-lost-ink transition-colors hover:bg-sunk"
                    >
                      Cancel
                    </button>
                  </form>
                </>
              ) : enquiry.status === 'CONVERTED' ? (
                <>
                  {enquiry.convertedProjectId ? (
                    <Link
                      href={`/jobs/${enquiry.convertedProjectId}`}
                      className="font-bold text-accent-ink hover:underline"
                    >
                      Open the job
                    </Link>
                  ) : null}
                  <form action={updateEnquiryAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="enquiryId" value={enquiry.id} />
                    <input type="hidden" name="op" value="cancel_job" />
                    <button
                      type="submit"
                      className="rounded px-3 py-1.5 text-sm font-bold text-lost-ink hover:underline"
                    >
                      Cancel job
                    </button>
                  </form>
                </>
              ) : (
                <form action={updateEnquiryAction}>
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="enquiryId" value={enquiry.id} />
                  <input type="hidden" name="op" value="reopen" />
                  <button
                    type="submit"
                    className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-ink-muted hover:text-ink"
                  >
                    Reopen lead
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Conversation */}
          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Conversation</h2>
            <div className="flex flex-col gap-3">
              {enquiry.communications.length === 0 ? (
                <p className="text-base text-ink-muted">No messages yet.</p>
              ) : (
                enquiry.communications.map((c) => {
                  const inbound = c.direction === 'inbound'
                  return (
                    <div key={c.id} className={inbound ? '' : 'text-right'}>
                      <div className="text-sm text-muted">
                        {inbound ? 'Client' : (c.by?.name ?? 'Staff')} · {formatSydneyDateTime(c.createdAt)}
                      </div>
                      <div
                        className={`mt-1 inline-block max-w-[85%] whitespace-pre-line rounded-md px-3 py-2 text-base ${
                          inbound ? 'bg-paper text-ink' : 'bg-ink text-surface'
                        }`}
                      >
                        {c.body}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {open ? (
              <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
                <form action={sendReplyAction} className="flex flex-col gap-2">
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="enquiryId" value={enquiry.id} />
                  <label className="text-sm font-bold text-ink">Reply to client</label>
                  <Textarea name="body" required placeholder="Write your reply..." />
                  <div>
                    <Button size="sm" type="submit">
                      Send reply
                    </Button>
                  </div>
                </form>
                <form action={logClientReplyAction} className="flex flex-col gap-2">
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="enquiryId" value={enquiry.id} />
                  <label className="text-sm font-bold text-ink">Log a message from the client</label>
                  <Textarea name="body" required placeholder="Paste what the client said..." />
                  <div>
                    <button
                      type="submit"
                      className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-ink-muted hover:text-ink"
                    >
                      Record client message
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        </div>

        {/* Enquiry details (wedding-enquiry fields captured on the add-client / website form) */}
        {(() => {
          const details: { label: string; value: string }[] = []
          const add = (label: string, v: string | null | undefined) => {
            if (v && v.trim()) details.push({ label, value: v })
          }
          add('Partner', enquiry.partnerName)
          add('Photo / video', enquiry.coverage)
          add('Event type', enquiry.eventType ? titleCase(enquiry.eventType) : null)
          add('Event date', enquiry.eventDate ? formatSydneyDate(enquiry.eventDate) : null)
          add('Getting-ready location', enquiry.gettingReadyLocation)
          add('Ceremony & reception', enquiry.ceremonyLocation)
          add('Guest count', enquiry.guestCount)
          add('How they heard', enquiry.heardAbout)
          add('Draws them to our style', enquiry.styleReason)
          if (details.length === 0) return null
          return (
            <div className="mt-4 rounded-md border border-line bg-surface p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Enquiry details</h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {details.map((d) => (
                  <div key={d.label}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">{d.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })()}

        {/* Client + Activity */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Client</h2>
            <div className="flex justify-between gap-4 border-t border-line py-2 first:border-t-0">
              <span className="text-sm text-muted">Email</span>
              <span className="text-base text-ink">{enquiry.email}</span>
            </div>
            <div className="flex justify-between gap-4 border-t border-line py-2">
              <span className="text-sm text-muted">Phone</span>
              <span className="text-base text-ink">{enquiry.phone ?? '-'}</span>
            </div>
          </div>

          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Activity</h2>
            {activity.length === 0 ? (
              <p className="text-base text-ink-muted">No activity yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {activity.map((a) => (
                  <div key={a.id} className="text-sm text-ink-muted">
                    <span className="tabular text-muted">{formatSydneyDateTime(a.createdAt)}</span>{' '}
                    {a.action.replace(/^enquiry\./, '').replace(/_/g, ' ')}
                    {a.actor?.name ? ` · ${a.actor.name}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
