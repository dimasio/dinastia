// События модуля assessments (скилл events-automations, domain.md §4). Подписчик — `learning` (завершение урока, 3.6).
import { z } from 'zod'
import { defineEvent } from '#/kernel/events.ts'

const attempt = { attemptId: z.uuid(), enrollmentId: z.uuid(), lessonId: z.uuid() }

/** Попытка отправлена (сдана вручную или автосдачей по таймеру). */
export const quizSubmitted = defineEvent('quiz.submitted', z.object(attempt))

/** Попытка оценена: `passed` известен (у попытки с `open_text` — после ручной проверки, 3.6). */
export const quizGraded = defineEvent('quiz.graded', z.object({ ...attempt, passed: z.boolean() }))

const submission = { submissionId: z.uuid(), enrollmentId: z.uuid(), lessonId: z.uuid(), blockKey: z.uuid() }

/** Сдача отправлена (первая или повторная после доработки). */
export const submissionSubmitted = defineEvent('submission.submitted', z.object(submission))

/** Сдача проверена: принята, возвращена на доработку или отклонена (при автопринятии — `accepted` сразу). Подписчики — 3.5, 3.6. */
export const submissionReviewed = defineEvent(
	'submission.reviewed',
	z.object({ ...submission, status: z.enum(['accepted', 'needs_revision', 'rejected']) }),
)
