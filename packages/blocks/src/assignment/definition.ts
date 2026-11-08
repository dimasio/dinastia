import { ASSIGNMENT_MAX_FILES } from '@dinastia/contracts/assessments'
import { collectFileIds, emptyDoc, isEmptyDoc, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { defineBlock } from '../define.ts'

/**
 * Домашнее задание (карточка 3.4): формулировка и что принимать — текст и/или файлы; `requires_review = false` — работа
 * принимается сразу при отправке. Сдача, статусы и проверка — модуль assessments (`assignment.*`); в плеере блок показывает
 * панель задания. Завершение урока по принятой работе — 3.6.
 */
export const assignment = defineBlock({
	type: 'assignment',
	category: 'interactive',
	schema: z.object({
		prompt: RichText,
		allowText: z.boolean().default(true),
		allowFiles: z.boolean().default(true),
		maxFiles: z.number().int().min(1).max(ASSIGNMENT_MAX_FILES).default(3),
		requiresReview: z.boolean().default(true),
	}),
	defaults: () => ({ prompt: emptyDoc(), allowText: true, allowFiles: true, maxFiles: 3, requiresReview: true }),
	completion: 'grade',
	issues: {
		noPrompt: (d) => isEmptyDoc(d.prompt),
		noAnswer: (d) => !d.allowText && !d.allowFiles,
	},
	// картинки в формулировке — файлы школы (2.7)
	files: (d) => collectFileIds(d.prompt),
})
