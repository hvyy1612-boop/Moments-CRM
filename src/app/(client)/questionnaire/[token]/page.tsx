import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getQuestionnaireByToken } from '@/lib/domain/questionnaire'
import { QuestionnaireForm } from './QuestionnaireForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Questionnaire - Moments' }

export default async function ClientQuestionnairePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const q = await getQuestionnaireByToken(token)
  if (!q) notFound()

  const done = q.status === 'COMPLETED'

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-md border border-line bg-surface p-8 shadow-sm">
        <div className="border-b border-line pb-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">{q.project.company.name}</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">{q.title ?? 'Questionnaire'}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {done ? 'Thanks - we have received your answers.' : `Hi ${q.project.client.displayName}, please fill in the details below for your shoot.`}
          </p>
        </div>

        <div className="mt-5">
          {done ? (
            <ul className="flex flex-col gap-3">
              {q.answers.map((a, i) => (
                <li key={i}>
                  <p className="text-sm font-semibold text-ink">{a.question}</p>
                  <p className="whitespace-pre-line text-sm text-ink-muted">{a.answer || '-'}</p>
                </li>
              ))}
            </ul>
          ) : (
            <QuestionnaireForm token={token} questions={q.answers.map((a) => ({ question: a.question, answer: a.answer }))} />
          )}
        </div>
      </div>
    </div>
  )
}
