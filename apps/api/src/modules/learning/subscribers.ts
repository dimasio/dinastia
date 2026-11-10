// Подписчики модуля learning (скилл events-automations, карточка 4.3): изменился набор опубликованных уроков или порог
// прохождения — пересчитать прогресс учеников курса. Подписчик сам выполняется задачей; та же работа вручную —
// задача `learning.recalc-course-progress` (`pnpm jobs:run`).
import type { BaseCtx } from '#/kernel/context.ts'
import { on } from '#/kernel/events.ts'
import { courseProgressRulesChanged, coursePublished, lessonPublished } from '../courses/events.ts'
import { recalcCourseProgress } from './service.ts'

const recalc = (ctx: BaseCtx, d: { courseId: string }) => recalcCourseProgress(ctx, d.courseId)

export const lessonPublishedSubscriber = on(lessonPublished, recalc, { key: 'progress' })
export const coursePublishedSubscriber = on(coursePublished, recalc, { key: 'progress' })
export const progressRulesSubscriber = on(courseProgressRulesChanged, recalc, { key: 'progress' })
