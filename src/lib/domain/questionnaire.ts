import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'

/** Questionnaires collect event details from the client (F-PORTAL-02). The fixed question set is a
 *  Company setting (OQ-016, TBD); this stores whatever questions/answers are used. */

export type QuestionnaireAnswerInput = { question: string; answer: string }

function questionnaireToken(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createQuestionnaire(projectId: string, title: string, questions: string[] = []) {
  const clean = questions.map((q) => q.trim()).filter(Boolean)
  if (clean.length === 0) throw new Error('Add at least one question.')
  return prisma.$transaction(async (tx) => {
    const questionnaire = await tx.questionnaire.create({
      data: { projectId, status: 'PENDING', accessToken: questionnaireToken(), title: title.trim().slice(0, 150) || null, sentAt: systemClock.now() },
    })
    questions = clean
    if (questions.length > 0) {
      await tx.questionnaireAnswer.createMany({
        data: questions.map((question, index) => ({
          questionnaireId: questionnaire.id,
          question,
          answer: '',
          sortOrder: index,
        })),
      })
    }
    return questionnaire
  })
}

/** Mark the questionnaire as sent to the client. */
export async function sendQuestionnaire(questionnaireId: string) {
  return prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: { sentAt: systemClock.now() },
  })
}

/** The client fills it in: replace the answers and mark it COMPLETED. */
export async function submitQuestionnaire(
  questionnaireId: string,
  answers: QuestionnaireAnswerInput[],
) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const questionnaire = await tx.questionnaire.findUnique({ where: { id: questionnaireId } })
    if (!questionnaire) throw new Error('Questionnaire not found.')

    await tx.questionnaireAnswer.deleteMany({ where: { questionnaireId } })
    if (answers.length > 0) {
      await tx.questionnaireAnswer.createMany({
        data: answers.map((entry, index) => ({
          questionnaireId,
          question: entry.question,
          answer: entry.answer,
          sortOrder: index,
        })),
      })
    }
    return tx.questionnaire.update({
      where: { id: questionnaireId },
      data: { status: 'COMPLETED', completedAt: now },
    })
  })
}

export async function getQuestionnaire(questionnaireId: string) {
  return prisma.questionnaire.findUnique({
    where: { id: questionnaireId },
    include: { answers: { orderBy: { sortOrder: 'asc' } } },
  })
}

/** Client-facing fetch by token (no session). Returns the questionnaire + its questions/answers. */
export async function getQuestionnaireByToken(token: string) {
  if (!token || token.length < 16) return null
  return prisma.questionnaire.findUnique({
    where: { accessToken: token },
    select: {
      id: true, status: true, title: true, completedAt: true,
      answers: { orderBy: { sortOrder: 'asc' }, select: { question: true, answer: true } },
      project: { select: { client: { select: { displayName: true } }, company: { select: { name: true } } } },
    },
  })
}

/** Submit by the client's token (guards the token, then reuses submitQuestionnaire). */
export async function submitQuestionnaireByToken(token: string, answers: QuestionnaireAnswerInput[]) {
  const q = await prisma.questionnaire.findUnique({ where: { accessToken: token }, select: { id: true } })
  if (!q) throw new Error('Questionnaire not found.')
  return submitQuestionnaire(q.id, answers)
}
