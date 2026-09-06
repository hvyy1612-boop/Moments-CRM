import { describe, expect, it } from 'vitest'
import { deriveTasks, type RowTask } from '@/app/(staff)/enquiries/stage-tasks'

/** The Enquiries list stage->task cascade (preview only). Selecting a stage ticks every task up to it. */
const tasks: RowTask[] = [
  { id: 'a', title: 'Enquiry received', stage: 'enquiry', done: false },
  { id: 'b', title: 'Send initial enquiry response', stage: 'enquiry', done: false },
  { id: 'c', title: 'Discuss shoot requirements', stage: 'enquiry', done: false },
  { id: 'd', title: 'Prepare client quote', stage: 'quote', done: false },
  { id: 'e', title: 'Send client quote', stage: 'quote', done: false },
  { id: 'f', title: 'Send contract and deposit invoice', stage: 'quote', done: false },
]
const doneIds = (rows: { id: string; done: boolean }[]) => rows.filter((r) => r.done).map((r) => r.id)

describe('deriveTasks - stage cascade (Enquiries list, preview only)', () => {
  it('no preview keeps the real backend completion', () => {
    const real = tasks.map((t, i) => ({ ...t, done: i < 2 }))
    expect(doneIds(deriveTasks(real, null, {}))).toEqual(['a', 'b'])
  })

  it('NEW ticks only the auto "Enquiry received"', () => {
    expect(doneIds(deriveTasks(tasks, 'NEW', {}))).toEqual(['a'])
  })

  it('CONTACTED ticks the enquiry-stage tasks, not the quote ones', () => {
    expect(doneIds(deriveTasks(tasks, 'CONTACTED', {}))).toEqual(['a', 'b', 'c'])
  })

  it('QUALIFIED (Quote sent) ticks quote tasks but not the contract/deposit', () => {
    expect(doneIds(deriveTasks(tasks, 'QUALIFIED', {}))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('CONVERTED (Booked) ticks everything', () => {
    expect(doneIds(deriveTasks(tasks, 'CONVERTED', {}))).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('a manual override wins over the cascade', () => {
    // At CONTACTED the contract task is off; a manual tick turns it on without changing the rest.
    expect(doneIds(deriveTasks(tasks, 'CONTACTED', { f: true }))).toEqual(['a', 'b', 'c', 'f'])
  })

  it('custom tasks fall back to their board-stage', () => {
    const custom: RowTask[] = [{ id: 'x', title: 'Send mood board', stage: 'quote', done: false }]
    expect(doneIds(deriveTasks(custom, 'CONTACTED', {}))).toEqual([]) // quote-stage -> not yet at Quote sent
    expect(doneIds(deriveTasks(custom, 'QUALIFIED', {}))).toEqual(['x'])
  })
})
