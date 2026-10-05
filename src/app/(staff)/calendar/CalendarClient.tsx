'use client'

import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useActionState, useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Select, TextInput, Textarea } from '@/components/ui/form'
import type { CalItem, CalendarViewData } from '@/lib/domain/calendar'
import { createCalendarEventAction, moveCalendarItemAction, type CalendarActionState } from './actions'

const IDLE: CalendarActionState = { status: 'idle' }
const ROW_H = 48 // hour-row height in week view (number -> React adds px, keeps design-token check clean)
const GUTTER = 56 // time-gutter width in week view

type ClientOption = { id: string; displayName: string }
type Prefill = { date: string; startTime?: string }

function catClass(item: CalItem): string {
  // Colour by CATEGORY so it reads against the filter tabs: Enquiries = purple, Job tasks = soft red,
  // Payments = peach, Events = grey. Shoots (bookings) keep their own green so the shoot day stands out.
  // Overdue adds a subtle ring rather than a loud fill. All tokens are the globals.css family.
  const base =
    item.category === 'payment' ? 'bg-peach text-ink'
    : item.category === 'event' ? 'bg-sunk text-ink'
    : item.category === 'lead' ? 'bg-lav text-ink'
    : item.kind === 'booking' ? 'bg-sage text-ink'
    : 'bg-lost text-ink'
  return item.tone === 'overdue' ? `${base} ring-1 ring-lost-ink/40` : base
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function minToLabel(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  const ap = h < 12 ? 'am' : 'pm', h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? ':' + pad(m) : ''}${ap}`
}

export function CalendarClient({
  data, csrf, canManage, clients,
}: {
  data: CalendarViewData
  csrf: string
  canManage: boolean
  clients: ClientOption[]
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [peek, setPeek] = useState<{ item: CalItem; x: number; y: number } | null>(null)
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startMove] = useTransition()
  const [moveErr, setMoveErr] = useState<string | null>(null)
  const router = useRouter()

  // Near-realtime: refresh when the tab regains focus and on a slow interval, so a colleague's change
  // shows up without a manual reload. (True push would use a websocket service - see Ably/Pusher.)
  useEffect(() => {
    const onFocus = () => router.refresh()
    window.addEventListener('focus', onFocus)
    const id = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, 60_000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id) }
  }, [router])

  const openAdd = useCallback((pf: Prefill) => {
    if (!canManage) return
    setPrefill(pf)
    setAddOpen(true)
  }, [canManage])

  const showPeek = useCallback((item: CalItem, e: { clientX: number; clientY: number }) => {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    setPeek({ item, x: e.clientX, y: e.clientY })
  }, [])
  const hidePeek = useCallback(() => {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(() => setPeek(null), 120)
  }, [])

  const doMove = useCallback((item: CalItem, dateKey: string, startMin: number | null) => {
    if (item.kind !== 'booking' && item.kind !== 'event') return
    if (item.dayKey === dateKey && item.startMin === startMin) return
    const fd = new FormData()
    fd.set('csrf', csrf); fd.set('kind', item.kind); fd.set('refId', item.refId)
    fd.set('date', dateKey); fd.set('startMin', startMin === null ? '' : String(startMin))
    setMoveErr(null)
    startMove(async () => {
      const res = await moveCalendarItemAction(fd)
      if (res.status === 'error') setMoveErr(res.message ?? 'Could not move the event.')
    })
  }, [csrf])

  return (
    <div className="relative">
      {data.conflictCount > 0 ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-lost-ink/40 bg-lost px-4 py-2.5 text-sm text-lost-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          {data.conflictCount === 1 ? '1 shoot clashes with another' : `${data.conflictCount} shoots clash with another`} - please check for a double-booking.
        </div>
      ) : null}
      {moveErr ? <Alert tone="danger" title={moveErr} /> : null}

      {data.view === 'week' && data.week ? (
        <WeekGrid data={data} canManage={canManage} onSlot={openAdd} onPeek={showPeek} onHide={hidePeek} onMove={doMove} />
      ) : data.month ? (
        <MonthGrid data={data} canManage={canManage} onDay={openAdd} onPeek={showPeek} onHide={hidePeek} onMove={doMove} />
      ) : null}

      {peek ? <EventPeek peek={peek} onEnter={() => peekTimer.current && clearTimeout(peekTimer.current)} onLeave={hidePeek} /> : null}

      {addOpen && prefill ? (
        <AddEventModal csrf={csrf} clients={clients} prefill={prefill} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  )
}

// ---- Month ----
function MonthGrid({
  data, canManage, onDay, onPeek, onHide, onMove,
}: {
  data: CalendarViewData
  canManage: boolean
  onDay: (pf: Prefill) => void
  onPeek: (item: CalItem, e: { clientX: number; clientY: number }) => void
  onHide: () => void
  onMove: (item: CalItem, dateKey: string, startMin: number | null) => void
}) {
  const m = data.month!
  const [more, setMore] = useState<{ items: CalItem[]; x: number; y: number } | null>(null)
  const cells: (string | null)[] = [
    ...Array.from({ length: m.leading }, () => null),
    ...Array.from({ length: m.daysInMonth }, (_, i) => `${m.year}-${pad(m.monthNum)}-${pad(i + 1)}`),
  ]
  const byDay = new Map<string, CalItem[]>()
  for (const it of data.items) byDay.set(it.dayKey, [...(byDay.get(it.dayKey) ?? []), it])
  for (const list of byDay.values()) list.sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1) || a.primary.localeCompare(b.primary))

  return (
    <>
    <div className="overflow-hidden rounded-md border border-line">
      <div className="grid grid-cols-7">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
          <div key={d} className="border-b border-r border-line bg-sunk px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-muted last:border-r-0">{d}</div>
        ))}
        {cells.map((dateKey, i) => {
          const day = dateKey ? Number(dateKey.slice(8)) : null
          const isToday = day !== null && day === m.todayDay
          const items = dateKey ? (byDay.get(dateKey) ?? []) : []
          return (
            <div
              key={i}
              data-datekey={dateKey ?? undefined}
              onClick={(e) => { if (dateKey && canManage && e.target === e.currentTarget) onDay({ date: dateKey }) }}
              className={`min-h-28 border-b border-r border-line p-2 text-sm [&:nth-child(7n)]:border-r-0 ${dateKey === null ? 'bg-paper' : 'bg-surface'} ${dateKey && canManage ? 'cursor-pointer' : ''}`}
            >
              {dateKey !== null ? (
                <>
                  <span className={`tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm ${isToday ? 'bg-accent font-semibold text-paper' : 'text-ink-muted'}`}>{day}</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {items.slice(0, 3).map((it) => <MonthChip key={it.id} item={it} canManage={canManage} onPeek={onPeek} onHide={onHide} onMove={onMove} />)}
                    {items.length > 3 ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setMore({ items, x: e.clientX, y: e.clientY }) }}
                        className="rounded px-1.5 py-0.5 text-left text-xs font-medium text-ink-muted hover:bg-sunk hover:text-ink"
                      >
                        + {items.length - 3} more
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
    {more ? <MonthMorePopover more={more} onClose={() => setMore(null)} canManage={canManage} onPeek={onPeek} onHide={onHide} onMove={onMove} /> : null}
    </>
  )
}

// "+N more" popover for a busy day: keeps the month row compact yet every item stays reachable
// without leaving the Month view (spec 11). Reuses the same chips + peek/drag behaviour.
function MonthMorePopover({ more, onClose, canManage, onPeek, onHide, onMove }: {
  more: { items: CalItem[]; x: number; y: number }
  onClose: () => void
  canManage: boolean
  onPeek: (item: CalItem, e: { clientX: number; clientY: number }) => void
  onHide: () => void
  onMove: (item: CalItem, dateKey: string, startMin: number | null) => void
}) {
  const left = Math.min(more.x, (typeof window !== 'undefined' ? window.innerWidth : 900) - 240)
  const top = Math.min(more.y, (typeof window !== 'undefined' ? window.innerHeight : 700) - 320)
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 w-56 rounded-lg border border-line-strong bg-surface p-2 shadow-lg" style={{ left, top }}>
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {more.items.map((it) => <MonthChip key={it.id} item={it} canManage={canManage} onPeek={onPeek} onHide={onHide} onMove={onMove} />)}
        </div>
      </div>
    </>
  )
}

function MonthChip({ item, canManage, onPeek, onHide, onMove }: {
  item: CalItem; canManage: boolean
  onPeek: (item: CalItem, e: { clientX: number; clientY: number }) => void
  onHide: () => void
  onMove: (item: CalItem, dateKey: string, startMin: number | null) => void
}) {
  const draggable = canManage && item.editable
  const dragged = useRef(false)
  const inner = (
    <>
      <span className={`block truncate text-xs font-medium ${item.done ? 'line-through opacity-70' : ''}`}>{item.primary}</span>
      <span className="block truncate text-xs opacity-80">{item.timeLabel ? `${item.timeLabel} - ` : ''}{item.secondary}</span>
    </>
  )
  const cls = `block rounded px-1.5 py-1 leading-tight ${catClass(item)} ${item.kind === 'task' ? 'border-l-2 border-current' : ''} ${item.conflict ? 'outline outline-2 outline-offset-1 outline-lost-ink' : ''} ${draggable ? 'cursor-grab' : ''}`
  const handlers = {
    onMouseEnter: (e: ReactMouseEvent) => onPeek(item, e),
    onMouseLeave: onHide,
    onPointerDown: draggable ? (e: ReactPointerEvent) => beginDrag(e, item, onMove, () => { dragged.current = true }) : undefined,
  }
  if (item.href) {
    return <Link href={item.href} className={cls} {...handlers} onClick={(e) => { if (dragged.current) { e.preventDefault(); dragged.current = false } }}>{inner}</Link>
  }
  return <div className={cls} {...handlers}>{inner}</div>
}

// ---- Week ----
function WeekGrid({ data, canManage, onSlot, onPeek, onHide, onMove }: {
  data: CalendarViewData; canManage: boolean
  onSlot: (pf: Prefill) => void
  onPeek: (item: CalItem, e: { clientX: number; clientY: number }) => void
  onHide: () => void
  onMove: (item: CalItem, dateKey: string, startMin: number | null) => void
}) {
  const w = data.week!
  const hours = Array.from({ length: w.endHour - w.startHour + 1 }, (_, i) => w.startHour + i)
  const total = (w.endHour - w.startHour) * ROW_H
  const timedByCol = w.days.map((d) => data.items.filter((it) => it.dayKey === d.dateKey && it.startMin !== null))
  // Undated items (enquiry + job tasks, invoice-due, undated appointments) have no clock time, so they
  // ride a slim strip pinned above the timeline instead of an hour slot. The strip only appears when the
  // week actually has some, so an empty week stays clean.
  const allDayByCol = w.days.map((d) => data.items.filter((it) => it.dayKey === d.dateKey && it.startMin === null))
  const hasAllDay = allDayByCol.some((c) => c.length > 0)

  // Full 24-hour day (Apple-style). Open scrolled to the working morning so the empty night hours
  // aren't what greets you - the body is the only thing that scrolls; the day header stays pinned.
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Open just above the 7am line (small margin so its label isn't clipped by the top edge).
    if (bodyRef.current) bodyRef.current.scrollTop = 7 * ROW_H - 8
  }, [])

  const slotClick = (dateKey: string, e: ReactMouseEvent<HTMLDivElement>) => {
    if (!canManage) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = w.startHour * 60 + Math.floor(((e.clientY - rect.top) / ROW_H) * 60 / 30) * 30
    onSlot({ date: dateKey, startTime: `${pad(Math.floor(min / 60))}:${pad(min % 60)}` })
  }

  return (
    <div className="overflow-hidden rounded-md border border-line">
      {/* header */}
      <div className="grid border-b border-line bg-sunk" style={{ gridTemplateColumns: `${GUTTER}px repeat(7, minmax(0, 1fr))` }}>
        <div className="border-r border-line" />
        {w.days.map((d) => (
          <div key={d.dateKey} className="min-w-0 border-r border-line py-1.5 text-center last:border-r-0">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">{d.dow}</div>
            <div className={`text-sm ${d.isToday ? 'mx-auto mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 font-semibold text-paper' : 'text-ink'}`}>{d.dayNum}</div>
          </div>
        ))}
      </div>
      {/* Untimed strip - pinned above the scrolling timeline (like the day header), so enquiry + job
          tasks, invoice-due and undated appointments stay visible on the week. Rendered only when the
          week has any; the gutter shows a small list glyph rather than the old "all-day" label. */}
      {hasAllDay ? (
        <div className="grid border-b border-line" style={{ gridTemplateColumns: `${GUTTER}px repeat(7, minmax(0, 1fr))` }}>
          <div className="flex items-start justify-end border-r border-line pr-1.5 pt-2 text-muted">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
          </div>
          {allDayByCol.map((cells, ci) => (
            <div key={w.days[ci]!.dateKey} className="min-w-0 border-r border-line p-1 last:border-r-0">
              <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
                {cells.map((it) => <WeekAllDayChip key={it.id} item={it} onPeek={onPeek} onHide={onHide} />)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {/* Timed body - the full 24h day, the only scrolling region (max-h-[70vh]; vh keeps the
          design-token check clean). The gutter renders one label per hour ROW (12am..11pm) so it lines
          up exactly with the day columns' rows - one extra label would make the gutter taller than the
          columns and leave an un-ruled gap at the bottom. */}
      <div ref={bodyRef} className="grid max-h-[70vh] overflow-y-auto" style={{ gridTemplateColumns: `${GUTTER}px repeat(7, minmax(0, 1fr))` }}>
        <div className="relative border-r border-line" style={{ height: total }}>
          {/* One label per gridline, vertically CENTRED on the rule it marks (Apple-style) so the time
              reads level with its line - not floating in the middle of the cell. The day columns draw
              their rules as row bottom-borders at y = k*ROW_H, so a label centred at that y sits on the
              line. The first label (12am) is top-aligned and the last (12am = next midnight) is
              bottom-aligned so neither is clipped by the scroll edges. */}
          {hours.map((h, k) => (
            <div
              key={h}
              className="absolute inset-x-0 pr-1.5 text-right text-xs text-muted"
              style={{ top: k * ROW_H, transform: k === 0 ? undefined : k === hours.length - 1 ? 'translateY(-100%)' : 'translateY(-50%)' }}
            >
              {minToLabel((h * 60) % 1440)}
            </div>
          ))}
        </div>
        {w.days.map((d, ci) => (
          <div
            key={d.dateKey}
            data-datekey={d.dateKey}
            data-weekcol="1"
            onClick={(e) => { if (e.target === e.currentTarget) slotClick(d.dateKey, e) }}
            className={`relative min-w-0 border-r border-line last:border-r-0 ${canManage ? 'cursor-pointer' : ''}`}
            style={{ height: total }}
          >
            {hours.slice(0, -1).map((h) => <div key={h} className="border-b border-line" style={{ height: ROW_H }} />)}
            {(timedByCol[ci] ?? []).map((it) => (
              <WeekBlock key={it.id} item={it} startHour={w.startHour} canManage={canManage} onPeek={onPeek} onHide={onHide} onMove={onMove} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Compact chip for the pinned untimed strip (enquiry/job tasks, invoice-due, undated appointments).
function WeekAllDayChip({ item, onPeek, onHide }: { item: CalItem; onPeek: (i: CalItem, e: { clientX: number; clientY: number }) => void; onHide: () => void }) {
  const cls = `block truncate rounded px-1.5 py-0.5 text-xs font-medium ${catClass(item)} ${item.kind === 'task' ? 'border-l-2 border-current' : ''} ${item.done ? 'line-through opacity-70' : ''} ${item.conflict ? 'outline outline-2 outline-lost-ink' : ''}`
  const label = item.secondary ? `${item.primary} - ${item.secondary}` : item.primary
  return item.href
    ? <Link href={item.href} className={cls} title={label} onMouseEnter={(e) => onPeek(item, e)} onMouseLeave={onHide}>{label}</Link>
    : <div className={cls} title={label} onMouseEnter={(e) => onPeek(item, e)} onMouseLeave={onHide}>{label}</div>
}

function WeekBlock({ item, startHour, canManage, onPeek, onHide, onMove }: {
  item: CalItem; startHour: number; canManage: boolean
  onPeek: (i: CalItem, e: { clientX: number; clientY: number }) => void
  onHide: () => void
  onMove: (item: CalItem, dateKey: string, startMin: number | null) => void
}) {
  const draggable = canManage && item.editable
  const dragged = useRef(false)
  const start = item.startMin ?? startHour * 60
  // A real end (a shoot) draws a block as tall as it lasts. A point-in-time item (a task or
  // appointment with only a start) sits in a compact marker so it does not fill - and look like it
  // spills into - the whole hour (Apple-style short events).
  const timed = item.endMin != null && item.endMin > start
  const end = timed ? item.endMin! : start + 60
  const top = ((start - startHour * 60) / 60) * ROW_H + 1
  const height = timed ? Math.max(((end - start) / 60) * ROW_H - 2, 22) : ROW_H / 2 - 2
  const cls = `absolute left-0.5 right-0.5 overflow-hidden rounded px-1.5 py-0.5 leading-tight ${catClass(item)} ${item.conflict ? 'outline outline-2 outline-lost-ink' : ''} ${draggable ? 'cursor-grab' : ''}`
  const inner = timed ? (
    <>
      <span className="block truncate text-xs font-medium">{item.timeLabel} {item.primary}</span>
      <span className="block truncate text-xs opacity-80">{item.secondary}</span>
    </>
  ) : (
    <span className="block truncate text-xs font-medium">{item.timeLabel} {item.primary}</span>
  )
  const handlers = {
    style: { top, height },
    onMouseEnter: (e: ReactMouseEvent) => onPeek(item, e),
    onMouseLeave: onHide,
    onPointerDown: draggable ? (e: ReactPointerEvent) => beginDrag(e, item, onMove, () => { dragged.current = true }, startHour) : undefined,
  }
  return item.href
    ? <Link href={item.href} className={cls} {...handlers} onClick={(e) => { if (dragged.current) { e.preventDefault(); dragged.current = false } }}>{inner}</Link>
    : <div className={cls} {...handlers}>{inner}</div>
}

// ---- Drag (pointer based, works for month cells and week columns) ----
function beginDrag(
  e: ReactPointerEvent,
  item: CalItem,
  onMove: (item: CalItem, dateKey: string, startMin: number | null) => void,
  markDragged: () => void,
  /** First hour of the week grid the item can be dropped on (the week view starts at 00:00). */
  startHour = 0,
) {
  const startX = e.clientX, startY = e.clientY
  let moved = false
  let ghost: HTMLDivElement | null = null

  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
    if (!moved) {
      moved = true
      ghost = document.createElement('div')
      ghost.textContent = item.primary
      ghost.className = 'pointer-events-none fixed z-50 rounded bg-ink px-2 py-0.5 text-xs font-bold text-surface shadow-lg'
      document.body.appendChild(ghost)
    }
    if (ghost) { ghost.style.left = `${ev.clientX + 10}px`; ghost.style.top = `${ev.clientY + 10}px` }
  }

  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (ghost) ghost.remove()
    if (!moved) return
    markDragged()
    const el = document.elementFromPoint(ev.clientX, ev.clientY)
    const col = el?.closest('[data-weekcol]') as HTMLElement | null
    const cell = el?.closest('[data-datekey]') as HTMLElement | null
    if (col) {
      const dateKey = col.getAttribute('data-datekey')!
      const rect = col.getBoundingClientRect()
      // The grid's real first hour, passed in - a hard-coded 7 saved every dropped shoot 7 hours late.
      const min = startHour * 60 + Math.max(0, Math.floor(((ev.clientY - rect.top) / ROW_H) * 60 / 15) * 15)
      onMove(item, dateKey, min)
    } else if (cell) {
      const dateKey = cell.getAttribute('data-datekey')
      if (dateKey) onMove(item, dateKey, item.startMin) // month: keep time, change day
    }
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// ---- Peek popover ----
function EventPeek({ peek, onEnter, onLeave }: { peek: { item: CalItem; x: number; y: number }; onEnter: () => void; onLeave: () => void }) {
  const it = peek.item
  const left = Math.min(peek.x + 12, (typeof window !== 'undefined' ? window.innerWidth : 900) - 260)
  const top = peek.y + 12
  return (
    <div className="fixed z-50 w-60 rounded-lg border border-line-strong bg-surface shadow-lg" style={{ left, top }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="px-3 pb-2 pt-3">
        <div className="text-sm font-bold text-ink">{it.primary}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${catClass(it)}`}>{it.secondary}</span>
          {it.timeLabel ? <span>{it.timeLabel}</span> : <span>All day</span>}
        </div>
        {it.location ? <div className="mt-1.5 text-xs text-ink-muted">{it.location}</div> : null}
        {it.status ? <div className="mt-1.5 text-xs capitalize text-ink-muted">Status: {it.status.toLowerCase()}</div> : null}
        {it.conflict ? <div className="mt-1.5 text-xs font-bold text-lost-ink">Clashes with another shoot</div> : null}
      </div>
      {it.href ? (
        <div className="border-t border-line px-3 py-2">
          <Link href={it.href} className="text-xs font-bold text-accent hover:underline">Open {it.category === 'lead' ? 'lead' : it.category === 'job' ? 'job' : 'client'} →</Link>
        </div>
      ) : null}
    </div>
  )
}

// ---- Toolbar buttons (top bar) ----
export function AddEventButton({ csrf, clients, date }: { csrf: string; clients: ClientOption[]; date: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Add event
      </Button>
      {open ? <AddEventModal csrf={csrf} clients={clients} prefill={{ date }} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

export function SyncButton({ feedPath }: { feedPath: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(feedPath)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setUrl(window.location.origin + feedPath) }, [feedPath])
  const webcal = url.replace(/^https?:/, 'webcal:')
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* selectable fallback */ }
  }
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 7 4M20 12a8 8 0 0 1-8 8 8 8 0 0 1-7-4M19 4v4h-4M5 20v-4h4" /></svg>
        Sync
      </Button>
      {open ? (
        <div className="absolute right-0 top-10 z-40 w-80 rounded-md border border-line bg-surface p-4 shadow-lg">
          <p className="text-sm font-semibold text-ink">Sync to your phone</p>
          <p className="mt-1 text-xs text-ink-muted">Subscribe to this link so every shoot &amp; appointment appears in your calendar.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar feed URL" className="h-8 min-w-0 flex-1 rounded border border-line-strong bg-paper px-2 text-xs text-ink" />
            <button type="button" onClick={copy} className="h-8 shrink-0 rounded border border-line-strong px-3 text-xs font-bold text-ink-muted hover:text-ink">{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <a href={webcal} className="mt-2 block text-xs font-bold text-accent hover:underline">Open in Apple Calendar (.ics)</a>
          <p className="mt-2 text-xs text-ink-muted">Google Calendar: Other calendars → From URL → paste the link.</p>
        </div>
      ) : null}
    </div>
  )
}

// ---- Add event modal (prefilled) ----
function AddEventModal({ csrf, clients, prefill, onClose }: { csrf: string; clients: ClientOption[]; prefill: Prefill; onClose: () => void }) {
  const [allDay, setAllDay] = useState(!prefill.startTime)
  const [state, action, pending] = useActionState(createCalendarEventAction, IDLE)
  useEffect(() => { if (state.status === 'success') onClose() }, [state.status, onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Add calendar event" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-md border border-line bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-ink">Add event</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-sunk hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <form action={action} className="flex flex-col gap-4 px-5 py-4">
          <input type="hidden" name="csrf" value={csrf} />
          {state.status === 'error' ? <Alert tone="danger" title={state.message ?? 'Please check the form.'} /> : null}
          <Field label="Type" htmlFor="ev-kind">
            <Select id="ev-kind" name="kind" defaultValue="APPOINTMENT">
              <option value="APPOINTMENT">Appointment</option>
              <option value="SHOOT">Extra shoot</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Title" htmlFor="ev-title" required>
            <TextInput id="ev-title" name="title" placeholder="Client consultation" maxLength={200} required autoFocus />
          </Field>
          <Field label="Date" htmlFor="ev-date" required>
            <TextInput id="ev-date" name="date" type="date" defaultValue={prefill.date} required />
          </Field>
          <Checkbox id="ev-allday" name="allDay" label="All day" checked={allDay} onChange={(e) => setAllDay(e.currentTarget.checked)} />
          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start" htmlFor="ev-start"><TextInput id="ev-start" name="startTime" type="time" defaultValue={prefill.startTime ?? '09:00'} /></Field>
              <Field label="End" htmlFor="ev-end"><TextInput id="ev-end" name="endTime" type="time" /></Field>
            </div>
          ) : null}
          <Field label="Client" htmlFor="ev-client" hint="Optional - links the event to a client.">
            <Select id="ev-client" name="clientId" defaultValue="">
              <option value="">No client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </Select>
          </Field>
          <Field label="Location" htmlFor="ev-location"><TextInput id="ev-location" name="location" placeholder="Studio, Surry Hills" maxLength={255} /></Field>
          <Field label="Notes" htmlFor="ev-notes"><Textarea id="ev-notes" name="notes" rows={3} maxLength={2000} /></Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={pending}>Add event</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
