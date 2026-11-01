// События модуля courses (скилл events-automations, domain.md §4). Подписчиков пока нет — появятся в learning (фаза 4).
import { z } from 'zod'
import { defineEvent } from '#/kernel/events.ts'

export const lessonPublished = defineEvent('lesson.published', z.object({ lessonId: z.uuid(), courseId: z.uuid() }))

export const coursePublished = defineEvent('course.published', z.object({ courseId: z.uuid() }))
