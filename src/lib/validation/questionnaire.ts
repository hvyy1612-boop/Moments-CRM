import { z } from 'zod'

export const QUESTIONS = [
  {
    key: 'ceremonyVenue',
    label: 'Ceremony venue and start time',
    hint: 'Where the ceremony happens and what time it begins.',
    required: true,
    long: false,
  },
  {
    key: 'receptionVenue',
    label: 'Reception venue and start time',
    hint: 'Leave blank if there is no reception, or if it is the same place.',
    required: false,
    long: false,
  },
  {
    key: 'gettingReadyAddress',
    label: 'Where you are getting ready',
    hint: 'The address, and roughly what time we should arrive.',
    required: false,
    long: false,
  },
  {
    key: 'timeline',
    label: 'How the day runs',
    hint: 'A rough order of events is plenty. Times matter more than detail.',
    required: false,
    long: true,
  },
  {
    key: 'keyPeople',
    label: 'People who matter',
    hint: 'Who should be in the family photos, and anyone we should recognise on sight.',
    required: false,
    long: true,
  },
  {
    key: 'mustHaveShots',
    label: 'Photographs you would be sad to miss',
    hint: 'Specific moments, objects or people. Three or four is usually enough.',
    required: false,
    long: true,
  },
  {
    key: 'accessNotes',
    label: 'Access and parking',
    hint: 'Anything about getting in, loading gear, or restrictions at the venue.',
    required: false,
    long: false,
  },
  {
    key: 'accessibilityNotes',
    label: 'Anything we should know',
    hint: 'Access needs, dietary requirements for the crew meal, or family situations to handle carefully.',
    required: false,
    long: true,
  },
] as const

export type QuestionKey = (typeof QUESTIONS)[number]['key']

const shape = Object.fromEntries(
  QUESTIONS.map((question) => [
    question.key,
    question.required
      ? z.string().trim().min(1, 'Please answer this one.').max(2000)
      : z.string().trim().max(2000),
  ]),
) as Record<QuestionKey, z.ZodString>

export const questionnaireSchema = z.object(shape).strict()

export type QuestionnaireAnswers = z.infer<typeof questionnaireSchema>

export function answersFrom(value: unknown): Partial<Record<QuestionKey, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const out: Partial<Record<QuestionKey, string>> = {}
  for (const question of QUESTIONS) {
    const answer = record[question.key]
    if (typeof answer === 'string' && answer.length > 0) out[question.key] = answer
  }
  return out
}
