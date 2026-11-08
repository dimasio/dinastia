import {
	QUIZ_QUESTIONS_MAX,
	QUIZ_TAGS_MAX,
	QUIZ_TIME_MAX_SEC,
	QUIZ_TIME_MIN_SEC,
} from '@dinastia/contracts/assessments'
import { Id } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineBlock } from '../define.ts'

export const QUIZ_SELECTIONS = ['fixed', 'random_by_tags'] as const
export const QUIZ_SHOW_CORRECT = ['never', 'after_submit', 'after_pass'] as const

/**
 * Тест (карточка 3.3): настройки и выбор вопросов из банка курса — фиксированный список или случайные по тегам.
 * Прохождение (попытки, ответы, проверка) — модуль assessments, процедуры `quiz.*`; в плеере блок показывает панель теста.
 * Новые поля с `default` — прежние данные остаются корректными.
 */
export const quiz = defineBlock({
	type: 'quiz',
	category: 'interactive',
	schema: z.object({
		selection: z.enum(QUIZ_SELECTIONS).default('fixed'),
		randomCount: z.number().int().min(1).max(QUIZ_QUESTIONS_MAX).default(5),
		attemptsLimit: z.number().int().min(0).max(100).default(0),
		passScorePct: z.number().int().min(0).max(100).default(60),
		timeLimitSec: z.number().int().min(QUIZ_TIME_MIN_SEC).max(QUIZ_TIME_MAX_SEC).nullable().default(null),
		shuffleQuestions: z.boolean().default(false),
		shuffleOptions: z.boolean().default(false),
		showCorrect: z.enum(QUIZ_SHOW_CORRECT).default('after_submit'),
		questions: z
			.array(z.object({ key: Id.optional(), questionId: Id }))
			.max(QUIZ_QUESTIONS_MAX)
			.default([]),
		tags: z
			.array(z.object({ key: Id.optional(), tagId: Id }))
			.max(QUIZ_TAGS_MAX)
			.default([]),
	}),
	children: { questions: 'questions', tags: 'tags' },
	defaults: () => ({
		selection: 'fixed' as const,
		randomCount: 5,
		attemptsLimit: 0,
		passScorePct: 60,
		timeLimitSec: null,
		shuffleQuestions: false,
		shuffleOptions: false,
		showCorrect: 'after_submit' as const,
		questions: [],
		tags: [],
	}),
	example: () => ({
		selection: 'fixed' as const,
		randomCount: 5,
		attemptsLimit: 3,
		passScorePct: 70,
		timeLimitSec: 600,
		shuffleQuestions: true,
		shuffleOptions: true,
		showCorrect: 'after_pass' as const,
		questions: [{ questionId: '0199e3a0-0000-7000-8000-000000000601' }],
		tags: [],
	}),
	completion: 'grade',
	issues: {
		noQuestions: (d) => d.selection === 'fixed' && d.questions.length === 0,
		noTags: (d) => d.selection === 'random_by_tags' && d.tags.length === 0,
	},
	// ученику — настройки и сколько вопросов; сами вопросы и теги раскрываются только в попытке
	toPublic: (d) => ({
		selection: d.selection,
		questionsCount: d.selection === 'fixed' ? d.questions.length : d.randomCount,
		attemptsLimit: d.attemptsLimit,
		passScorePct: d.passScorePct,
		timeLimitSec: d.timeLimitSec,
		showCorrect: d.showCorrect,
	}),
})
