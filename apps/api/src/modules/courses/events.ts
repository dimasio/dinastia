// События модуля courses (скилл events-automations, domain.md §4). Подписчики — learning (пересчёт прогресса, 4.3).
import { z } from 'zod'
import { defineEvent } from '#/kernel/events.ts'

export const lessonPublished = defineEvent('lesson.published', z.object({ lessonId: z.uuid(), courseId: z.uuid() }))

export const coursePublished = defineEvent('course.published', z.object({ courseId: z.uuid() }))

/** Изменилось то, от чего считается прогресс: удалены опубликованные уроки или изменён порог прохождения (4.3). */
export const courseProgressRulesChanged = defineEvent('course.progress_rules_changed', z.object({ courseId: z.uuid() }))
