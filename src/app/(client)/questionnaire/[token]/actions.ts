'use server'

import { getQuestionnaireByToken, submitQuestionnaireByToken } from '@/lib/domain/questionnaire'

export type QuestionnaireFormState = { status: 'idle' | 'success' | 'error'; message?: string }

export async function submitQuestionnaireFormAction(
  _prev: QuestionnaireFormState,
  formData: FormData,
): Promise<QuestionnaireFormState> {
  const token = String(formData.get('token') ?? '')
  const q = await getQuestionnaireByToken(token)
  if (!q) return { status: 'error', message: 'This link is no longer valid.' }
  if (q.status === 'COMPLETED') return { status: 'success' }

  const answers = q.answers.map((a, i) => ({
    question: a.question,
    answer: String(formData.get(`answer_${i}`) ?? '').trim(),
  }))
  try {
    await submitQuestionnaireByToken(token, answers)
  } catch {
    return { status: 'error', message: 'Could not submit your answers. Please try again.' }
  }
  return { status: 'success' }
}
