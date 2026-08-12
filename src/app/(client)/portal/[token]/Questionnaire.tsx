'use client'

import { useActionState, useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/form'
import { QUESTIONS, type QuestionKey } from '@/lib/validation/questionnaire'
import { submitQuestionnaire, type QuestionnaireState } from './actions'

const INITIAL: QuestionnaireState = { status: 'idle' }

export function Questionnaire({
  token,
  answers,
  submittedAt,
  editable,
}: {
  token: string
  answers: Partial<Record<QuestionKey, string>>
  submittedAt: string | null
  editable: boolean
}) {
  const [state, action, pending] = useActionState(submitQuestionnaire, INITIAL)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (state.status === 'saved') setEditing(false)
  }, [state])

  const done = submittedAt !== null || state.status === 'saved'
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}

  if (done && !editing) {
    return (
      <div className="rounded border border-line bg-surface p-4">
        <p className="text-base text-ink">Thank you, the studio has your plans.</p>
        {submittedAt ? (
          <p className="mt-1 text-xs text-ink-muted">Sent {submittedAt}.</p>
        ) : null}
        <dl className="mt-4 flex flex-col gap-3">
          {QUESTIONS.filter((question) => answers[question.key]).map((question) => (
            <div key={question.key}>
              <dt className="text-xs text-ink-muted">{question.label}</dt>
              <dd className="text-sm whitespace-pre-line text-ink">{answers[question.key]}</dd>
            </div>
          ))}
        </dl>
        {editable ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => setEditing(true)}
          >
            Change an answer
          </Button>
        ) : (
          <p className="mt-4 text-xs text-ink-muted">
            The day has passed, so these answers are now part of the record.
          </p>
        )}
      </div>
    )
  }

  if (!editable) {
    return (
      <p className="text-base text-ink-muted">
        This is filled in before the shoot. The day has passed, so there is nothing to add here.
      </p>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-5 rounded border border-line bg-surface p-4">
      {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
      <input type="hidden" name="token" value={token} />

      <p className="max-w-prose text-base text-ink-muted">
        The more the studio knows, the less you have to think about on the day. Only the first
        question is required, and you can change any of it later.
      </p>

      {QUESTIONS.map((question) => (
        <Field
          key={question.key}
          label={question.label}
          htmlFor={question.key}
          hint={question.hint}
          required={question.required}
          error={errors[question.key]}
        >
          {question.long ? (
            <Textarea
              id={question.key}
              name={question.key}
              defaultValue={answers[question.key] ?? ''}
              hasError={Boolean(errors[question.key])}
              rows={3}
            />
          ) : (
            <TextInput
              id={question.key}
              name={question.key}
              defaultValue={answers[question.key] ?? ''}
              hasError={Boolean(errors[question.key])}
            />
          )}
        </Field>
      ))}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          Send to the studio
        </Button>
        {editing ? (
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
