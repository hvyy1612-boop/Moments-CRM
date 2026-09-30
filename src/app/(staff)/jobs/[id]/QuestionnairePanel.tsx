'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/StatusPill'
import { Field, Textarea, TextInput } from '@/components/ui/form'
import { createQuestionnaireAction, type QuoteActionState } from '../actions'

const IDLE: QuoteActionState = { status: 'idle' }
const PRESET = `What time does your ceremony start, and how long does it run?
Ceremony venue name and full address?
Reception venue name and full address (if different)?
Where are you (and your partner) getting ready?
Who are the key people we must photograph (immediate family, bridal party)?
Any must-have shots, moments or family groupings?
Rough timeline / run sheet for the day?
Any special requests, surprises or restrictions we should know?`

export type QuestionnaireView = {
  id: string
  title: string | null
  status: string
  accessToken: string | null
  completedLabel: string | null
  answers: { question: string; answer: string }[]
}

export function QuestionnairePanel({ csrf, projectId, questionnaires }: { csrf: string; projectId: string; questionnaires: QuestionnaireView[] }) {
  const [state, action, pending] = useActionState(createQuestionnaireAction, IDLE)

  return (
    <div className="mt-4 flex flex-col gap-4">
      {questionnaires.map((q) => (
        <div key={q.id} className="rounded border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-ink">{q.title ?? 'Questionnaire'}{q.completedLabel ? <span className="text-ink-muted"> · completed {q.completedLabel}</span> : null}</p>
            <StatusPill tone={q.status === 'COMPLETED' ? 'good' : 'neutral'}>{q.status.toLowerCase()}</StatusPill>
          </div>
          {q.status === 'COMPLETED' ? (
            <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
              {q.answers.map((a, i) => (
                <li key={i}>
                  <p className="text-sm font-semibold text-ink">{a.question}</p>
                  <p className="whitespace-pre-line text-sm text-ink-muted">{a.answer || '-'}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}

      <form action={action} className="flex flex-col gap-3 border-t border-line pt-4">
        {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
        {state.status === 'success' ? <Alert tone="success" title="Questionnaire created - copy the link above" /> : null}
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="projectId" value={projectId} />
        <p className="text-sm font-semibold text-ink">New questionnaire</p>
        <Field label="Title" htmlFor="q-title">
          <TextInput id="q-title" name="title" defaultValue="Pre-wedding questionnaire" maxLength={150} />
        </Field>
        <Field label="Questions (one per line)" htmlFor="q-questions">
          <Textarea id="q-questions" name="questions" rows={8} defaultValue={PRESET} />
        </Field>
        <div>
          <Button type="submit" loading={pending}>Create &amp; get link</Button>
        </div>
      </form>
    </div>
  )
}
