'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/form'
import { submitQuestionnaireFormAction, type QuestionnaireFormState } from './actions'

const IDLE: QuestionnaireFormState = { status: 'idle' }

export function QuestionnaireForm({ token, questions }: { token: string; questions: { question: string; answer: string }[] }) {
  const [state, action, pending] = useActionState(submitQuestionnaireFormAction, IDLE)

  if (state.status === 'success') {
    return <Alert tone="success" title="Thank you - your answers have been sent to the studio." />
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === 'error' ? <Alert tone="danger" title={state.message ?? 'Something went wrong.'} /> : null}
      <input type="hidden" name="token" value={token} />
      {questions.map((q, i) => (
        <Field key={i} label={q.question} htmlFor={`answer_${i}`}>
          <Textarea id={`answer_${i}`} name={`answer_${i}`} rows={3} defaultValue={q.answer} />
        </Field>
      ))}
      <div>
        <Button type="submit" loading={pending}>Submit answers</Button>
      </div>
    </form>
  )
}
