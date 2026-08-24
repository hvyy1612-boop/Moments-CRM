import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'

export type QuestionnaireAnswerInput = { question: string; answer: string }

export async function createQuestionnaire(projectId: string, questions: string[] = []) {
  return prisma.$transaction(async (tx) => {
    const questionnaire = await tx.questionnaire.create({
      data: { projectId, status: 'PENDING' },
    })
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

export async function sendQuestionnaire(questionnaireId: string) {
  return prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: { sentAt: systemClock.now() },
  })
}

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
