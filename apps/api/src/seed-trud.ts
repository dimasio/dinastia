// pnpm db:seed:trud — демо-школа по охране труда для показа (скилл local-env). Всё — через сервисы, как из запросов
// сотрудников и учеников, с датами за последние недели (ctx.now). Школа уже есть — ничего не делает; пересоздать:
// pnpm db:reset && pnpm db:seed && pnpm db:seed:trud.

import { type RichTextDoc, toPlainText } from '@dinastia/contracts/common'
import type { MemberRole } from '@dinastia/contracts/schools'
import { and, desc, eq } from 'drizzle-orm'
import { auth } from './kernel/auth/auth.ts'
import { users } from './kernel/auth/schema.ts'
import { stopBoss } from './kernel/boss.ts'
import { config } from './kernel/config.ts'
import type { SchoolCtx } from './kernel/context.ts'
import { db, pool, type Tx } from './kernel/db/client.ts'
import { withTenant } from './kernel/db/tenant.ts'
import { log } from './kernel/log.ts'
import { members } from './kernel/members/schema.ts'
import { tenantCtx } from './kernel/tenant-ctx.ts'
import { gradeAttempt } from './modules/assessments/grading.service.ts'
import { createBankQuestion, listTags, normalizeTags } from './modules/assessments/question.service.ts'
import { saveAnswer, startAttempt, submitAttempt } from './modules/assessments/quiz.service.ts'
import { submissions } from './modules/assessments/schema.ts'
import { replyAsStudent, reviewSubmission, submitAssignment } from './modules/assessments/submission.service.ts'
import { getTemplate, issueCompleted, saveTemplate } from './modules/certificates/service.ts'
import { addLessonBlock, listLessonBlocks, updateLessonBlock } from './modules/courses/blocks.service.ts'
import { publishCourse, publishLesson } from './modules/courses/publish.service.ts'
import {
	createCourse,
	createLesson,
	createSection,
	updateCourse,
	updateLessonSettings,
} from './modules/courses/service.ts'
import { enroll, revokeEnrollment } from './modules/learning/enrollment.service.ts'
import { createGroup } from './modules/learning/groups.service.ts'
import { createLinkInvite } from './modules/learning/invites.service.ts'
import { enrollments } from './modules/learning/schema.ts'
import { openLesson } from './modules/learning/service.ts'
import { createSchool, findSchoolBySlug } from './modules/schools/service.ts'

const PASSWORD = 'demo12345'
const SLUG = 'trud'
const DAY = 24 * 60 * 60 * 1000
const MIN = 60 * 1000

if (config.NODE_ENV === 'production') throw new Error('db:seed:trud запрещён в production')

// ── форматированный текст ────────────────────────────────────────────────────────────────────────────────────

type Node = Record<string, unknown>
const txt = (text: string, marks: string[] = []) =>
	marks.length ? { type: 'text', text, marks: marks.map((type) => ({ type })) } : { type: 'text', text }
const b = (text: string) => txt(text, ['bold'])
const p = (...parts: (string | Node)[]): Node => ({
	type: 'paragraph',
	content: parts.map((x) => (typeof x === 'string' ? txt(x) : x)),
})
const h = (level: 2 | 3, text: string): Node => ({ type: 'heading', attrs: { level }, content: [txt(text)] })
const item = (x: string | Node) => ({ type: 'listItem', content: [typeof x === 'string' ? p(x) : x] })
const ul = (...items: (string | Node)[]): Node => ({ type: 'bulletList', content: items.map(item) })
const ol = (...items: (string | Node)[]): Node => ({
	type: 'orderedList',
	attrs: { start: 1, type: null },
	content: items.map(item),
})
const quote = (text: string): Node => ({ type: 'blockquote', content: [p(text)] })
const doc = (...content: Node[]) => ({ type: 'doc', content }) as unknown as RichTextDoc
const line = (text: string) => doc(p(text))
const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({
	type,
	attrs: { colspan: 1, rowspan: 1, colwidth: null },
	content: [p(text)],
})
const table = (head: string[], rows: string[][]): Node => ({
	type: 'table',
	content: [
		{ type: 'tableRow', content: head.map((x) => cell('tableHeader', x)) },
		...rows.map((r) => ({ type: 'tableRow', content: r.map((x) => cell('tableCell', x)) })),
	],
})

// ── люди ────────────────────────────────────────────────────────────────────────────────────────────────────

async function ensureUser(email: string, name: string) {
	const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
	if (found) return found.id
	const res = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } })
	await db.update(users).set({ emailVerified: true }).where(eq(users.id, res.user.id))
	return res.user.id
}

const STAFF: [key: string, email: string, name: string, role: MemberRole][] = [
	['admin', 'admin@trud.local', 'Денис Орлов', 'admin'],
	['teacher', 'teacher@trud.local', 'Сергей Волков', 'teacher'],
	['medic', 'medic@trud.local', 'Елена Миронова', 'teacher'],
	['curator', 'curator@trud.local', 'Анна Кузнецова', 'curator'],
]
const STUDENTS: [key: string, name: string][] = [
	['petrov', 'Иван Петров'],
	['smirnova', 'Ольга Смирнова'],
	['kozlov', 'Андрей Козлов'],
	['popova', 'Наталья Попова'],
	['lebedev', 'Михаил Лебедев'],
	['novikova', 'Екатерина Новикова'],
	['morozov', 'Павел Морозов'],
	['vasilieva', 'Юлия Васильева'],
	['fedorov', 'Дмитрий Фёдоров'],
	['alekseeva', 'Светлана Алексеева'],
	['grigoriev', 'Артём Григорьев'],
	['zakharova', 'Ирина Захарова'],
]

if (await findSchoolBySlug(SLUG)) {
	console.log(`db:seed:trud — школа ${SLUG} уже есть; пересоздать: pnpm db:reset && pnpm db:seed && pnpm db:seed:trud`)
	await pool.end()
	process.exit(0)
}

const ownerId = await ensureUser('owner@trud.local', 'Марина Соколова')
const { school } = await createSchool({ slug: SLUG, name: 'Учебный центр «Безопасный труд»' }, { userId: ownerId })
const people = new Map<string, { userId: string; email: string; name: string; role: MemberRole }>()
for (const [key, email, name, role] of STAFF)
	people.set(key, { userId: await ensureUser(email, name), email, name, role })
for (const [key, name] of STUDENTS) {
	const email = `${key}@trud.local`
	people.set(key, { userId: await ensureUser(email, name), email, name, role: 'student' })
}

const today = new Date()
/** Момент «N дней назад» (плюс минуты) — история прохождения за последние недели. */
const ago = (days: number, minutes = 0) => new Date(today.getTime() - days * DAY + minutes * MIN)

await withTenant(school.id, async (tx: Tx) => {
	const memberIds = new Map<string, string>()
	for (const [key, who] of people) {
		const [row] = await tx.insert(members).values({ userId: who.userId, role: who.role }).returning({ id: members.id })
		if (row) memberIds.set(key, row.id)
	}

	/** Контекст участника в момент `at` — как из его запроса. */
	const as = (key: string, at: Date = today): SchoolCtx => {
		const who = people.get(key)
		const memberId = memberIds.get(key)
		if (!who || !memberId) throw new Error(`нет участника ${key}`)
		return {
			...tenantCtx(tx, school, { now: () => at, log }),
			user: { id: who.userId, email: who.email, name: who.name },
			member: { id: memberId, role: who.role },
			can: () => true,
		}
	}

	// ── конструктор ─────────────────────────────────────────────────────────────────────────────────────────

	type BlockSpec =
		| { type: 'heading'; text: string; level?: 'h2' | 'h3' }
		| { type: 'text'; body: RichTextDoc }
		| { type: 'callout'; tone: 'info' | 'warning' | 'success'; body: RichTextDoc }
		| { type: 'divider' }
		| { type: 'assignment'; prompt: RichTextDoc; requiresReview?: boolean }
		| {
				type: 'quiz'
				/** Номера вопросов в банке курса (по порядку создания); не задано и нет `randomTags` — все. */
				pick?: number[]
				/** Случайная выборка `randomCount` вопросов по тегам. */
				randomTags?: string[]
				randomCount?: number
				passScorePct: number
				attemptsLimit: number
				timeLimitSec: number | null
				showCorrect?: 'never' | 'after_submit' | 'after_pass'
				questionIds?: string[]
				tagIds?: string[]
		  }

	type LessonSpec = { title: string; blocks: BlockSpec[]; graded?: boolean }

	async function addBlocks(ctx: SchoolCtx, lessonId: string, blocks: BlockSpec[]) {
		for (const spec of blocks) {
			const block = await addLessonBlock(ctx, { lessonId, type: spec.type })
			const data: Record<string, unknown> | null =
				spec.type === 'heading'
					? { level: spec.level ?? 'h2', text: spec.text }
					: spec.type === 'text'
						? { body: spec.body }
						: spec.type === 'callout'
							? { tone: spec.tone, body: spec.body }
							: spec.type === 'assignment'
								? {
										prompt: spec.prompt,
										allowText: true,
										allowFiles: true,
										maxFiles: 3,
										requiresReview: spec.requiresReview ?? true,
									}
								: spec.type === 'quiz'
									? {
											selection: spec.tagIds ? 'random_by_tags' : 'fixed',
											randomCount: spec.randomCount ?? 5,
											attemptsLimit: spec.attemptsLimit,
											passScorePct: spec.passScorePct,
											timeLimitSec: spec.timeLimitSec,
											shuffleQuestions: Boolean(spec.tagIds),
											shuffleOptions: true,
											showCorrect: spec.showCorrect ?? 'after_submit',
											questions: spec.tagIds ? [] : (spec.questionIds ?? []).map((questionId) => ({ questionId })),
											tags: (spec.tagIds ?? []).map((tagId) => ({ tagId })),
										}
									: null
			if (data) await updateLessonBlock(ctx, { id: block.id, data })
		}
	}

	/** Курс из разделов и уроков; вернёт id курса и уроков по порядку. */
	async function buildCourse(
		ctx: SchoolCtx,
		input: {
			title: string
			description: RichTextDoc
			accessDays: number | null
			accessMode: 'open' | 'sequential'
			sections: { title: string; lessons: LessonSpec[] }[]
			publish: boolean
			questions?: (courseId: string) => Promise<string[]>
		},
	) {
		const course = await createCourse(ctx, { title: input.title, description: input.description })
		await updateCourse(ctx, { id: course.id, defaultAccessMode: input.accessMode, accessDays: input.accessDays })
		const questionIds = input.questions ? await input.questions(course.id) : []
		const tags = input.questions ? await listTags(ctx, course.id) : []
		const tagId = (name: string) => {
			const id = tags.find((t) => t.name === normalizeTags([name])[0])?.id
			if (!id) throw new Error(`нет тега ${name}`)
			return id
		}
		const lessonIds: string[] = []
		const kinds: ('view' | 'quiz' | 'assignment')[] = []
		for (const section of input.sections) {
			const s = await createSection(ctx, { courseId: course.id, title: section.title })
			for (const spec of section.lessons) {
				const lesson = await createLesson(ctx, { sectionId: s.id, title: spec.title })
				const blocks = spec.blocks.map((x) =>
					x.type !== 'quiz'
						? x
						: x.randomTags
							? { ...x, tagIds: x.randomTags.map(tagId) }
							: { ...x, questionIds: x.pick ? x.pick.map((i) => questionIds[i] as string) : questionIds },
				)
				kinds.push(
					spec.blocks.some((x) => x.type === 'quiz')
						? 'quiz'
						: spec.blocks.some((x) => x.type === 'assignment')
							? 'assignment'
							: 'view',
				)
				await addBlocks(ctx, lesson.id, blocks)
				if (spec.graded) await updateLessonSettings(ctx, { id: lesson.id, completionRule: 'all_blocks' })
				if (input.publish) await publishLesson(ctx, lesson.id)
				lessonIds.push(lesson.id)
			}
		}
		if (input.publish) await publishCourse(ctx, course.id)
		return { courseId: course.id, lessonIds, kinds }
	}

	// ── банк вопросов ───────────────────────────────────────────────────────────────────────────────────────

	type Q =
		| { type: 'single_choice'; prompt: string; options: string[]; correct: number; explain: string; tags: string[] }
		| { type: 'multiple_choice'; prompt: string; options: string[]; correct: number[]; explain: string; tags: string[] }
		| { type: 'text_input'; prompt: string; accepted: string[]; explain: string; tags: string[] }
		| { type: 'ordering'; prompt: string; steps: string[]; explain: string; tags: string[] }
		| {
				type: 'open_text'
				prompt: string
				explain: string
				points: number
				tags: string[]
				/** Ответы демо-учеников и отзыв проверяющего — сильный и слабый. */
				answers?: Record<'good' | 'weak', string>
				feedback?: Record<'good' | 'weak', string>
		  }

	/** Верные ответы по тексту вопроса — чтобы демо-ученики отвечали правдоподобно. */
	const answerKey = new Map<string, Q>()

	async function bank(ctx: SchoolCtx, courseId: string, qs: Q[]) {
		const ids: string[] = []
		for (const q of qs) {
			answerKey.set(q.prompt, q)
			const common = { prompt: line(q.prompt), explanation: line(q.explain) }
			const data =
				q.type === 'single_choice'
					? {
							...common,
							points: 1,
							options: q.options.map((o, i) => ({ body: line(o), isCorrect: i === q.correct })),
						}
					: q.type === 'multiple_choice'
						? {
								...common,
								points: 2,
								scoring: 'partial',
								options: q.options.map((o, i) => ({ body: line(o), isCorrect: q.correct.includes(i) })),
							}
						: q.type === 'text_input'
							? { ...common, points: 1, caseSensitive: false, accepted: q.accepted.map((text) => ({ text })) }
							: q.type === 'ordering'
								? {
										...common,
										points: 3,
										scoring: 'partial',
										steps: q.steps.map((x, i) => ({ body: line(x), correctPosition: i })),
									}
								: { ...common, points: q.points }
			ids.push((await createBankQuestion(ctx, { courseId, type: q.type, data, tags: q.tags })).id)
		}
		return ids
	}

	// ── прохождение ─────────────────────────────────────────────────────────────────────────────────────────

	type Quality = 'good' | 'weak'
	const OPEN_ANSWERS: Record<Quality, string> = {
		good:
			'На участке сборки основные опасности: движущиеся части конвейера, падение деталей с высоты стеллажа, шум выше 80 дБА. ' +
			'Меры: защитные ограждения и блокировка при открытии, складирование тяжёлых деталей на нижние ярусы, ' +
			'наушники и чередование работы с отдыхом в тихой зоне.',
		weak: 'Опасностей почти нет, работаем аккуратно.',
	}

	/** Ответ на упорядочивание: верный порядок, у слабого — первые два шага переставлены. */
	const orderOf = (steps: string[], shown: { id: string; body: RichTextDoc }[], quality: Quality) => {
		const ids = steps.map((x) => shown.find((s) => toPlainText(s.body).trim() === x)?.id as string)
		if (quality === 'weak' && ids.length > 1) [ids[0], ids[1]] = [ids[1] as string, ids[0] as string]
		return ids
	}

	/** Попытка теста: `good` отвечает верно, `weak` — ошибается в выборе вариантов. */
	async function takeQuiz(key: string, lessonId: string, blockKey: string, at: Date, quality: Quality) {
		const attempt = await startAttempt(as(key, at), { lessonId, blockKey })
		for (const aq of attempt.questions) {
			const data = aq.data as {
				prompt: RichTextDoc
				options?: { id: string; body: RichTextDoc }[]
				steps?: { id: string; body: RichTextDoc }[]
			}
			const q = answerKey.get(toPlainText(data.prompt).trim())
			if (!q) continue
			const optionId = (n: number) =>
				data.options?.find((o) => toPlainText(o.body).trim() === (q as { options: string[] }).options[n])?.id
			const wrong = (correct: number[], count: number) =>
				[...Array(count).keys()].filter((i) => !correct.includes(i)).slice(0, 1)
			const response =
				q.type === 'single_choice'
					? { selected: optionId(quality === 'good' ? q.correct : (q.correct + 1) % q.options.length) ?? null }
					: q.type === 'multiple_choice'
						? {
								selected: (quality === 'good' ? q.correct : wrong(q.correct, q.options.length))
									.map(optionId)
									.filter(Boolean),
							}
						: q.type === 'text_input'
							? { text: quality === 'good' ? (q.accepted[0] ?? '') : 'не знаю' }
							: q.type === 'ordering'
								? { order: orderOf(q.steps, data.steps ?? [], quality) }
								: { text: q.answers?.[quality] ?? OPEN_ANSWERS[quality] }
			await saveAnswer(as(key, new Date(at.getTime() + 3 * MIN)), {
				attemptId: attempt.attempt.id,
				attemptQuestionId: aq.id,
				response,
			})
		}
		await submitAttempt(as(key, new Date(at.getTime() + 12 * MIN)), attempt.attempt.id)
		return attempt
	}

	/** Проверка ручных вопросов попытки преподавателем. */
	async function gradeOpen(attempt: Awaited<ReturnType<typeof takeQuiz>>, at: Date, quality: Quality) {
		const grades = attempt.questions
			.filter((aq) => aq.type === 'open_text')
			.map((aq) => {
				const q = answerKey.get(toPlainText((aq.data as { prompt: RichTextDoc }).prompt).trim())
				const custom = q?.type === 'open_text' ? q.feedback?.[quality] : undefined
				return {
					attemptQuestionId: aq.id,
					score: quality === 'good' ? aq.points : 1,
					feedback: line(
						custom ??
							(quality === 'good'
								? 'Хороший разбор: опасности названы конкретно, меры реалистичны.'
								: 'Слишком общо — назовите конкретные опасности и меры по каждой.'),
					),
				}
			})
		if (grades.length) await gradeAttempt(as('teacher', at), { attemptId: attempt.attempt.id, grades })
	}

	/** Открыть уроки по порядку (правило «просмотр» завершает урок). */
	async function study(key: string, lessonIds: string[], from: Date, stepDays = 1) {
		for (const [i, id] of lessonIds.entries())
			await openLesson(as(key, new Date(from.getTime() + i * stepDays * DAY)), id)
	}

	const blockKeyOf = async (lessonId: string, type: string) => {
		const block = (await listLessonBlocks(as('teacher'), lessonId)).find((x) => x.type === type)
		if (!block) throw new Error(`в уроке нет блока ${type}`)
		return block.blockKey
	}

	// ═══ Курс 1. Программа А ═══════════════════════════════════════════════════════════════════════════════

	const teacherCtx = as('teacher', ago(40))
	const courseA = await buildCourse(teacherCtx, {
		title: 'Общие вопросы охраны труда и функционирования СУОТ',
		description: doc(
			p(
				'Обучение по программе А для руководителей, специалистов и членов комиссий по проверке знаний. Курс охватывает ',
				'правовую базу, систему управления охраной труда, оценку рисков, СОУТ и порядок расследования несчастных случаев.',
			),
			p(b('Итог: '), 'тест из 8 вопросов, проходной балл — 70%.'),
		),
		accessDays: 60,
		accessMode: 'sequential',
		publish: true,
		questions: (courseId) =>
			bank(teacherCtx, courseId, [
				{
					type: 'single_choice',
					prompt: 'Как часто проводится обучение по охране труда по программе А для работающих руководителей?',
					options: [
						'Не реже одного раза в год',
						'Не реже одного раза в три года',
						'Не реже одного раза в пять лет',
						'Только при приёме на работу',
					],
					correct: 1,
					explain: 'Периодическое обучение по программам охраны труда — не реже одного раза в три года.',
					tags: ['законодательство'],
				},
				{
					type: 'single_choice',
					prompt: 'Как часто проводится повторный инструктаж по охране труда на рабочем месте?',
					options: ['Ежемесячно', 'Не реже одного раза в шесть месяцев', 'Раз в год', 'Раз в три года'],
					correct: 1,
					explain: 'Повторный инструктаж — не реже одного раза в шесть месяцев (если иное не установлено правилами).',
					tags: ['инструктажи'],
				},
				{
					type: 'multiple_choice',
					prompt: 'Какие классы условий труда по итогам СОУТ относятся к вредным или опасным?',
					options: ['1 — оптимальный', '2 — допустимый', '3 — вредный', '4 — опасный'],
					correct: [2, 3],
					explain: 'Вредные — класс 3 (подклассы 3.1–3.4), опасные — класс 4.',
					tags: ['СОУТ'],
				},
				{
					type: 'text_input',
					prompt: 'Сколько классов условий труда установлено по итогам специальной оценки? Ответьте цифрой.',
					accepted: ['4', 'четыре'],
					explain: 'Четыре класса: оптимальный, допустимый, вредный, опасный.',
					tags: ['СОУТ'],
				},
				{
					type: 'single_choice',
					prompt: 'Как часто проводится специальная оценка условий труда при неизменных условиях?',
					options: [
						'Ежегодно',
						'Раз в три года',
						'Не реже одного раза в пять лет',
						'Один раз при создании рабочего места',
					],
					correct: 2,
					explain: 'Плановая СОУТ — не реже одного раза в пять лет.',
					tags: ['СОУТ'],
				},
				{
					type: 'single_choice',
					prompt: 'Какой срок расследования лёгкого несчастного случая?',
					options: ['1 день', '3 календарных дня', '15 календарных дней', '30 календарных дней'],
					correct: 1,
					explain: 'Лёгкий — 3 календарных дня; тяжёлый, групповой, со смертельным исходом — 15 календарных дней.',
					tags: ['несчастные случаи'],
				},
				{
					type: 'multiple_choice',
					prompt: 'Что работодатель обязан сделать сразу после несчастного случая на производстве?',
					options: [
						'Организовать первую помощь и доставку пострадавшего в медицинскую организацию',
						'Сохранить обстановку на месте происшествия, если это не угрожает людям',
						'Продолжить работу участка в обычном режиме',
						'Сообщить о тяжёлом случае в установленные органы в течение суток',
					],
					correct: [0, 1, 3],
					explain: 'Помощь пострадавшему, сохранение обстановки и извещение органов — первоочередные обязанности.',
					tags: ['несчастные случаи'],
				},
				{
					type: 'open_text',
					prompt: 'Опишите две-три основные опасности на вашем рабочем месте и меры по снижению риска для каждой.',
					explain: 'Ожидается: конкретная опасность → оценка → мера (устранение, замена, ограждение, СИЗ).',
					points: 3,
					tags: ['оценка рисков'],
				},
			]),
		sections: [
			{
				title: 'Основы законодательства',
				lessons: [
					{
						title: 'Охрана труда: термины и правовая база',
						blocks: [
							{ type: 'heading', text: 'Что такое охрана труда' },
							{
								type: 'text',
								body: doc(
									p(
										b('Охрана труда'),
										' — система сохранения жизни и здоровья работников в процессе трудовой деятельности: правовые, ',
										'социально-экономические, организационно-технические, санитарно-гигиенические, лечебно-профилактические и иные мероприятия.',
									),
									h(3, 'Основные документы'),
									ul(
										'Трудовой кодекс РФ, раздел X «Охрана труда»',
										'Порядок обучения по охране труда и проверки знаний требований охраны труда',
										'Правила по охране труда для отдельных видов работ',
										'Локальные акты организации: положение о СУОТ, инструкции, программы инструктажей',
									),
								),
							},
							{
								type: 'callout',
								tone: 'info',
								body: line(
									'Требования охраны труда обязательны для работодателя и работника — независимо от формы собственности организации.',
								),
							},
						],
					},
					{
						title: 'Права и обязанности работодателя и работника',
						blocks: [
							{ type: 'heading', text: 'Работодатель обязан' },
							{
								type: 'text',
								body: doc(
									ul(
										'создать и обеспечить функционирование системы управления охраной труда',
										'проводить обучение, инструктажи и проверку знаний',
										'выдавать сертифицированные СИЗ за счёт средств работодателя',
										'организовать специальную оценку условий труда и оценку профессиональных рисков',
										'не допускать к работе без обучения, медосмотров и СИЗ',
									),
								),
							},
							{ type: 'heading', text: 'Работник обязан и вправе' },
							{
								type: 'text',
								body: doc(
									p(
										'Работник соблюдает требования охраны труда, правильно применяет СИЗ, проходит обучение и медосмотры, ',
										'немедленно сообщает руководителю о ситуации, угрожающей жизни и здоровью людей.',
									),
									quote(
										'Работник вправе отказаться от выполнения работ при возникновении опасности для его жизни и здоровья — до её устранения.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'warning',
								body: line(
									'Отказ от опасной работы не может быть основанием для дисциплинарной ответственности работника.',
								),
							},
						],
					},
				],
			},
			{
				title: 'Система управления охраной труда',
				lessons: [
					{
						title: 'Оценка профессиональных рисков',
						graded: true,
						blocks: [
							{
								type: 'text',
								body: doc(
									p('Оценка рисков — обязательный элемент СУОТ. Порядок работы:'),
									ol(
										'Выявить опасности на каждом рабочем месте (обход, опрос работников, анализ происшествий).',
										'Оценить уровень риска: вероятность × тяжесть последствий.',
										'Определить меры по снижению: устранение опасности → замена → инженерные меры → организационные меры → СИЗ.',
										'Зафиксировать результаты и пересматривать их при изменении условий.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'success',
								body: line(
									'СИЗ — последний уровень защиты: сначала устраняйте опасность или отделяйте от неё человека.',
								),
							},
							{ type: 'divider' },
							{
								type: 'assignment',
								prompt: doc(
									p(b('Практическое задание. '), 'Составьте перечень опасностей на своём рабочем месте:'),
									ul(
										'не меньше трёх опасностей',
										'уровень риска для каждой (низкий, средний, высокий)',
										'мера по снижению риска',
									),
									p('Можно приложить фото рабочего места или таблицу.'),
								),
							},
						],
					},
					{
						title: 'Специальная оценка условий труда',
						blocks: [
							{
								type: 'text',
								body: doc(
									p(
										'СОУТ проводит аккредитованная организация по договору с работодателем; результаты — класс условий труда на рабочем месте.',
									),
									h(3, 'Классы условий труда'),
									ul('1 — оптимальные', '2 — допустимые', '3 — вредные (подклассы 3.1–3.4)', '4 — опасные'),
									p(
										'Плановая СОУТ — не реже одного раза в пять лет; внеплановая — при вводе новых рабочих мест, смене оборудования, ',
										'после несчастного случая и по предписанию инспекции.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'info',
								body: line('Работник должен быть ознакомлен с результатами СОУТ на своём рабочем месте под подпись.'),
							},
						],
					},
				],
			},
			{
				title: 'Несчастные случаи на производстве',
				lessons: [
					{
						title: 'Расследование и учёт несчастных случаев',
						blocks: [
							{
								type: 'text',
								body: doc(
									h(3, 'Действия сразу после происшествия'),
									ol(
										'Организовать первую помощь и при необходимости доставку в медицинскую организацию.',
										'Принять меры против развития аварийной ситуации и воздействия опасных факторов на других.',
										'Сохранить обстановку на месте происшествия (или зафиксировать её фото и схемой).',
										'Сообщить в установленные органы о групповом, тяжёлом или смертельном случае — в течение суток.',
									),
									h(3, 'Сроки расследования'),
									ul(
										'лёгкий несчастный случай — 3 календарных дня',
										'тяжёлый, групповой, со смертельным исходом — 15 календарных дней',
									),
								),
							},
							{
								type: 'callout',
								tone: 'warning',
								body: line(
									'Сокрытие несчастного случая — административное правонарушение; срок хранения актов — 45 лет.',
								),
							},
						],
					},
					{
						title: 'Итоговый тест по программе А',
						graded: true,
						blocks: [
							{
								type: 'text',
								body: doc(
									p(
										'8 вопросов, 20 минут, 3 попытки. Проходной балл — 70%. Вопрос с развёрнутым ответом проверяет преподаватель.',
									),
								),
							},
							{ type: 'quiz', passScorePct: 70, attemptsLimit: 3, timeLimitSec: 20 * 60 },
						],
					},
				],
			},
		],
	})

	// ═══ Курс 2. Первая помощь ═════════════════════════════════════════════════════════════════════════════

	const medicCtx = as('medic', ago(35))
	const courseFirstAid = await buildCourse(medicCtx, {
		title: 'Оказание первой помощи пострадавшим',
		description: doc(
			p(
				'Программа обучения оказанию первой помощи для всех работников. Порядок действий на месте происшествия, ',
				'сердечно-лёгочная реанимация, остановка кровотечений, помощь при ожогах и травмах.',
			),
		),
		accessDays: 30,
		accessMode: 'open',
		publish: true,
		questions: (courseId) =>
			bank(medicCtx, courseId, [
				{
					type: 'single_choice',
					prompt: 'С чего начинается оказание первой помощи?',
					options: [
						'С вызова скорой помощи',
						'С проверки безопасности для себя и пострадавшего',
						'С сердечно-лёгочной реанимации',
						'С поиска свидетелей',
					],
					correct: 1,
					explain: 'Сначала — оценка обстановки и устранение угрожающих факторов, иначе пострадавших станет больше.',
					tags: ['порядок действий'],
				},
				{
					type: 'text_input',
					prompt: 'По какому единому номеру вызывают экстренные службы с мобильного телефона?',
					accepted: ['112'],
					explain: '112 — единый номер вызова экстренных оперативных служб.',
					tags: ['порядок действий'],
				},
				{
					type: 'single_choice',
					prompt: 'Каково соотношение компрессий грудной клетки и вдохов при СЛР у взрослого?',
					options: ['15 : 2', '30 : 2', '5 : 1', '50 : 5'],
					correct: 1,
					explain: '30 надавливаний на грудину, затем 2 вдоха искусственного дыхания.',
					tags: ['СЛР'],
				},
				{
					type: 'single_choice',
					prompt: 'На какую глубину продавливается грудная клетка взрослого при компрессиях?',
					options: ['1–2 см', '3–4 см', '5–6 см', '8–10 см'],
					correct: 2,
					explain: 'Глубина компрессий — 5–6 см, частота — 100–120 в минуту.',
					tags: ['СЛР'],
				},
				{
					type: 'multiple_choice',
					prompt: 'Что нельзя делать при термическом ожоге?',
					options: [
						'Охлаждать место ожога прохладной водой',
						'Смазывать ожог маслом или кремом',
						'Вскрывать пузыри',
						'Отдирать прилипшую одежду',
					],
					correct: [1, 2, 3],
					explain:
						'Ожог охлаждают проточной прохладной водой; масло, вскрытие пузырей и отрывание одежды усугубляют травму.',
					tags: ['ожоги'],
				},
				{
					type: 'single_choice',
					prompt: 'На какое максимальное время накладывается кровоостанавливающий жгут?',
					options: ['Не более 15 минут', 'Не более 1 часа', 'Не более 3 часов', 'До приезда скорой, без ограничения'],
					correct: 1,
					explain: 'Жгут — не более 1 часа; под жгут кладут записку со временем наложения.',
					tags: ['кровотечения'],
				},
			]),
		sections: [
			{
				title: 'Общие принципы',
				lessons: [
					{
						title: 'Порядок оказания первой помощи',
						blocks: [
							{
								type: 'text',
								body: doc(
									ol(
										'Оценить обстановку и обеспечить безопасные условия.',
										'Определить признаки жизни: сознание, дыхание.',
										'Вызвать скорую медицинскую помощь — 112 или 103.',
										'Выполнить мероприятия по поддержанию жизни до приезда помощи.',
										'Контролировать состояние пострадавшего, оказывать психологическую поддержку.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'info',
								body: line(
									'Первую помощь вправе оказывать любой обученный работник; аптечки размещаются так, чтобы их можно было взять за 1–2 минуты.',
								),
							},
						],
					},
					{
						title: 'Сердечно-лёгочная реанимация',
						blocks: [
							{
								type: 'text',
								body: doc(
									p('Если пострадавший без сознания и не дышит нормально — сразу начинайте СЛР.'),
									ul(
										'основание ладони — на центр грудной клетки, руки прямые',
										'глубина компрессий 5–6 см, частота 100–120 в минуту',
										'30 компрессий → 2 вдоха; без маски-клапана допускаются только компрессии',
										'не прерывайтесь до появления признаков жизни или приезда скорой',
									),
								),
							},
							{
								type: 'callout',
								tone: 'warning',
								body: line('Не тратьте время на поиск пульса на сонной артерии — ориентируйтесь на дыхание.'),
							},
						],
					},
				],
			},
			{
				title: 'Травмы и неотложные состояния',
				lessons: [
					{
						title: 'Остановка кровотечений',
						blocks: [
							{
								type: 'text',
								body: doc(
									ol(
										'Прямое давление на рану — рукой в перчатке через салфетку.',
										'Давящая повязка.',
										'Кровоостанавливающий жгут — при сильном артериальном кровотечении из конечности, выше раны.',
									),
									p(b('Жгут — не более 1 часа. '), 'Под жгут кладут записку с датой и временем наложения.'),
								),
							},
						],
					},
					{
						title: 'Ожоги, переломы, отравления',
						blocks: [
							{
								type: 'text',
								body: doc(
									h(3, 'Ожоги'),
									p(
										'Охлаждать проточной прохладной водой не менее 20 минут, закрыть стерильной повязкой. Не вскрывать пузыри, не смазывать маслом.',
									),
									h(3, 'Переломы'),
									p(
										'Обездвижить конечность подручными средствами, захватив два соседних сустава. Открытый перелом — сначала остановить кровотечение.',
									),
									h(3, 'Отравления'),
									p('Вывести пострадавшего из зоны воздействия, обеспечить приток свежего воздуха, вызвать скорую.'),
								),
							},
						],
					},
					{
						title: 'Тест по первой помощи',
						graded: true,
						blocks: [
							{ type: 'text', body: line('6 вопросов, без ограничения времени. Проходной балл — 80%.') },
							{ type: 'quiz', passScorePct: 80, attemptsLimit: 0, timeLimitSec: null },
						],
					},
				],
			},
		],
	})

	// ═══ Курс 3. СИЗ ═══════════════════════════════════════════════════════════════════════════════════════

	const courseSiz = await buildCourse(as('teacher', ago(30)), {
		title: 'Использование средств индивидуальной защиты',
		description: line(
			'Выбор, проверка исправности, правильное применение и хранение СИЗ. Для работников, которым выдаются СИЗ.',
		),
		accessDays: null,
		accessMode: 'sequential',
		publish: true,
		sections: [
			{
				title: 'СИЗ на рабочем месте',
				lessons: [
					{
						title: 'Классификация СИЗ и нормы выдачи',
						blocks: [
							{
								type: 'text',
								body: doc(
									p(
										'СИЗ выдаются по Единым типовым нормам и нормам организации — по результатам СОУТ и оценки рисков.',
									),
									ul(
										'специальная одежда и обувь',
										'средства защиты головы, глаз и лица',
										'средства защиты органов дыхания и слуха',
										'средства защиты рук',
										'средства защиты от падения с высоты',
									),
								),
							},
							{
								type: 'callout',
								tone: 'info',
								body: line('Выдача СИЗ фиксируется в личной карточке учёта — бумажной или электронной.'),
							},
						],
					},
					{
						title: 'Защита органов дыхания и слуха',
						blocks: [
							{
								type: 'text',
								body: doc(
									p(
										'Респиратор подбирается по типу вредного вещества и его концентрации; перед каждым применением — проверка ',
										'прилегания (тест на плотность).',
									),
									p('Беруши и противошумные наушники применяются при уровне шума выше 80 дБА.'),
								),
							},
						],
					},
					{
						title: 'Практика: проверка исправности СИЗ',
						graded: true,
						blocks: [
							{
								type: 'assignment',
								prompt: doc(
									p(
										'Проверьте свои СИЗ перед сменой и опишите результат: что проверили, какие дефекты нашли, что заменили.',
									),
									p('Приложите фото, если есть дефекты.'),
								),
							},
						],
					},
				],
			},
		],
	})

	// ═══ Курс 4. Работы на высоте — черновик в конструкторе ═════════════════════════════════════════════════

	await buildCourse(as('teacher', ago(5)), {
		title: 'Безопасные методы и приёмы выполнения работ на высоте',
		description: line('Программа для работников 1, 2 и 3 групп по безопасности работ на высоте. В разработке.'),
		accessDays: 90,
		accessMode: 'sequential',
		publish: false,
		sections: [
			{
				title: 'Организация работ на высоте',
				lessons: [
					{
						title: 'Что считается работой на высоте',
						blocks: [
							{
								type: 'text',
								body: doc(
									p(
										'К работам на высоте относятся работы, при которых существует риск падения с высоты 1,8 м и более, ',
										'а также работы на расстоянии менее 2 м от неогороженных перепадов высоты.',
									),
								),
							},
						],
					},
					{ title: 'Наряд-допуск и план производства работ', blocks: [{ type: 'heading', text: 'Наряд-допуск' }] },
				],
			},
			{ title: 'Средства защиты от падения', lessons: [{ title: 'Страховочные системы', blocks: [] }] },
		],
	})

	// ═══ Курс 5. Пожарная безопасность ═════════════════════════════════════════════════════════════════════

	const fireCtx = as('teacher', ago(45))
	const fireQuestions: Q[] = [
		// основы — 0…4
		{
			type: 'single_choice',
			prompt: 'Что необходимо для возникновения и развития горения?',
			options: [
				'Горючее вещество, окислитель и источник зажигания',
				'Только высокая температура окружающего воздуха',
				'Горючее вещество и вода',
				'Электрический ток и металл',
			],
			correct: 0,
			explain:
				'«Треугольник огня»: убираем любую из трёх сторон — горение прекращается. На этом основаны все способы тушения.',
			tags: ['основы'],
		},
		{
			type: 'multiple_choice',
			prompt: 'Какие из перечисленных факторов относятся к опасным факторам пожара?',
			options: [
				'Пламя и искры',
				'Повышенная концентрация токсичных продуктов горения',
				'Снижение видимости в дыму',
				'Повышенная влажность воздуха',
			],
			correct: [0, 1, 2],
			explain:
				'Опасные факторы пожара: пламя и искры, тепловой поток, повышенная температура, токсичные продукты горения, пониженная концентрация кислорода, снижение видимости в дыму.',
			tags: ['основы'],
		},
		{
			type: 'single_choice',
			prompt: 'Что чаще всего становится причиной гибели людей при пожаре?',
			options: [
				'Отравление дымом и продуктами горения',
				'Ожоги открытым пламенем',
				'Обрушение конструкций',
				'Падение при эвакуации',
			],
			correct: 0,
			explain:
				'Большинство погибших — жертвы дыма и угарного газа: человек теряет сознание раньше, чем до него доходит пламя.',
			tags: ['основы'],
		},
		{
			type: 'text_input',
			prompt: 'По какому номеру вызывают пожарную охрану со стационарного телефона? Ответьте цифрами.',
			accepted: ['101', '01'],
			explain: '101 (или 01) — пожарная охрана; 112 — единый номер экстренных служб, работает с любого телефона.',
			tags: ['основы'],
		},
		{
			type: 'single_choice',
			prompt: 'Какой федеральный закон определяет общие правовые основы обеспечения пожарной безопасности в России?',
			options: [
				'«О пожарной безопасности»',
				'«О защите прав потребителей»',
				'«Об охране окружающей среды»',
				'«О техническом регулировании»',
			],
			correct: 0,
			explain:
				'Федеральный закон № 69-ФЗ «О пожарной безопасности»; требования к объектам — в № 123-ФЗ, порядок — в Правилах противопожарного режима.',
			tags: ['основы'],
		},
		// режим — 5…11
		{
			type: 'single_choice',
			prompt: 'Как часто по общему правилу проводится повторный противопожарный инструктаж?',
			options: [
				'Не реже одного раза в год',
				'Не реже одного раза в три года',
				'Ежемесячно',
				'Только при приёме на работу',
			],
			correct: 0,
			explain:
				'Повторный инструктаж — не реже раза в год; для пожароопасных и взрывопожароопасных производств и ряда объектов — не реже раза в полгода.',
			tags: ['режим'],
		},
		{
			type: 'single_choice',
			prompt:
				'Какой противопожарный инструктаж проводится перед разовыми работами повышенной пожарной опасности, например огневыми?',
			options: ['Целевой', 'Вводный', 'Повторный', 'Первичный на рабочем месте'],
			correct: 0,
			explain: 'Целевой инструктаж — перед разовыми работами с повышенной пожарной опасностью, в том числе огневыми.',
			tags: ['режим'],
		},
		{
			type: 'multiple_choice',
			prompt: 'Что запрещено делать на путях эвакуации?',
			options: [
				'Загромождать коридоры и выходы мебелью, коробками, оборудованием',
				'Запирать эвакуационные выходы на замки, которые нельзя открыть изнутри без ключа',
				'Размещать знаки пожарной безопасности',
				'Снимать доводчики с противопожарных дверей и фиксировать их в открытом положении',
			],
			correct: [0, 1, 3],
			explain:
				'Пути эвакуации должны быть свободны, двери — открываться изнутри без ключа, противопожарные двери — закрываться сами.',
			tags: ['режим'],
		},
		{
			type: 'single_choice',
			prompt: 'Где разрешено курить на территории организации?',
			options: [
				'Только в специально отведённых местах, обозначенных знаком «Место для курения»',
				'В любом месте на улице',
				'В туалете при открытом окне',
				'На лестничной клетке у окна',
			],
			correct: 0,
			explain:
				'Место для курения определяет руководитель и обозначает знаком; там же — ёмкость для окурков из негорючего материала.',
			tags: ['режим'],
		},
		{
			type: 'multiple_choice',
			prompt: 'Какие нарушения при эксплуатации электросетей могут привести к пожару?',
			options: [
				'Розетки и провода с повреждённой изоляцией',
				'Самодельные вставки вместо предохранителей («жучки»)',
				'Несколько мощных обогревателей, включённых в один удлинитель',
				'Использование исправных сертифицированных розеток',
			],
			correct: [0, 1, 2],
			explain: 'Перегрузка, короткое замыкание и плохой контакт — основные электрические причины пожаров.',
			tags: ['режим'],
		},
		{
			type: 'single_choice',
			prompt: 'Кто назначает в организации лицо, ответственное за обеспечение пожарной безопасности?',
			options: ['Руководитель организации', 'Инспектор МЧС', 'Профсоюзный комитет', 'Каждый работник сам'],
			correct: 0,
			explain: 'Ответственного назначает руководитель организации своим распорядительным документом.',
			tags: ['режим'],
		},
		{
			type: 'single_choice',
			prompt: 'Как часто проводятся практические тренировки по эвакуации на объектах с массовым пребыванием людей?',
			options: [
				'Не реже одного раза в полугодие',
				'Один раз в пять лет',
				'Только при вводе здания в эксплуатацию',
				'По желанию руководителя',
			],
			correct: 0,
			explain: 'Тренировки по эвакуации на таких объектах — не реже одного раза в полугодие.',
			tags: ['режим'],
		},
		// средства — 12…19
		{
			type: 'single_choice',
			prompt: 'Каким огнетушителем можно тушить электроустановку под напряжением до 10 кВ?',
			options: ['Углекислотным (ОУ)', 'Воздушно-пенным (ОВП)', 'Водным (ОВ)', 'Любым огнетушителем'],
			correct: 0,
			explain:
				'Углекислотный — до 10 кВ с расстояния не ближе 1 м; порошковый — до 1000 В. Водой и пеной электроустановки под напряжением не тушат.',
			tags: ['средства'],
		},
		{
			type: 'single_choice',
			prompt: 'Почему нельзя браться голой рукой за раструб углекислотного огнетушителя?',
			options: [
				'Раструб охлаждается до −70 °C — можно получить обморожение',
				'Раструб находится под напряжением',
				'Раструб раскаляется от углекислоты',
				'Раструб может отломиться',
			],
			correct: 0,
			explain: 'Углекислота при выходе резко расширяется и охлаждает раструб — держите огнетушитель только за ручку.',
			tags: ['средства'],
		},
		{
			type: 'single_choice',
			prompt: 'К какому классу относятся пожары горючих жидкостей — бензина, масла, растворителей?',
			options: ['B', 'A', 'C', 'D'],
			correct: 0,
			explain:
				'A — твёрдые вещества, B — жидкости и плавящиеся вещества, C — газы, D — металлы, E — электроустановки под напряжением.',
			tags: ['средства'],
		},
		{
			type: 'text_input',
			prompt: 'Каким буквенным классом обозначают пожары электроустановок под напряжением? Ответьте одной буквой.',
			accepted: ['E', 'Е'],
			explain: 'Класс E — горение электроустановок под напряжением.',
			tags: ['средства'],
		},
		{
			type: 'single_choice',
			prompt: 'С какой стороны подходят к очагу пожара при тушении огнетушителем на открытом воздухе?',
			options: [
				'С наветренной — ветер в спину',
				'С подветренной — ветер в лицо',
				'Сбоку, перпендикулярно ветру',
				'Это не имеет значения',
			],
			correct: 0,
			explain: 'Ветер в спину уносит дым и жар от вас, а огнетушащее вещество — к очагу.',
			tags: ['средства'],
		},
		{
			type: 'single_choice',
			prompt: 'Сколько человек нужно, чтобы привести в действие внутренний пожарный кран?',
			options: ['Двое', 'Один', 'Четверо', 'Только подразделение пожарной охраны'],
			correct: 0,
			explain: 'Один раскатывает рукав и держит ствол, второй открывает вентиль крана по команде.',
			tags: ['средства'],
		},
		{
			type: 'multiple_choice',
			prompt: 'Что проверяют при осмотре огнетушителя на посту?',
			options: [
				'Наличие пломбы и предохранительной чеки',
				'Стрелку манометра — в зелёной зоне',
				'Целостность корпуса, шланга и раструба',
				'Цвет стены рядом с огнетушителем',
			],
			correct: [0, 1, 2],
			explain: 'Плюс — бирку или паспорт с датой следующей перезарядки и свободный доступ к огнетушителю.',
			tags: ['средства'],
		},
		{
			type: 'single_choice',
			prompt: 'На человеке загорелась одежда. Что нужно сделать?',
			options: [
				'Остановить, повалить на землю и накрыть плотной тканью или противопожарным покрывалом',
				'Направить в лицо струю углекислотного огнетушителя',
				'Сказать бежать к воде',
				'Сбивать пламя руками, пока человек стоит',
			],
			correct: 0,
			explain: 'Бег раздувает пламя; лёжа и под покрывалом огонь гаснет без доступа воздуха. Голову не накрывают.',
			tags: ['средства'],
		},
		// действия — 20…25
		{
			type: 'single_choice',
			prompt: 'Что нужно сделать в первую очередь при обнаружении пожара?',
			options: [
				'Сообщить в пожарную охрану по 101 или 112, назвать адрес и что горит',
				'Тушить самостоятельно до последнего',
				'Собрать документы и личные вещи',
				'Открыть окна, чтобы выпустить дым',
			],
			correct: 0,
			explain:
				'Вызов пожарной охраны — первое действие по Правилам противопожарного режима; открытые окна раздувают огонь.',
			tags: ['действия'],
		},
		{
			type: 'multiple_choice',
			prompt: 'Как правильно двигаться по задымлённому коридору при эвакуации?',
			options: [
				'Пригнувшись или ползком — у пола меньше дыма',
				'Защитив органы дыхания влажной тканью',
				'Держась рукой за стену, чтобы не потерять направление',
				'Спуститься на лифте — так быстрее',
			],
			correct: [0, 1, 2],
			explain: 'Лифтом при пожаре пользоваться нельзя; закрывайте за собой двери, чтобы задержать дым.',
			tags: ['действия'],
		},
		{
			type: 'single_choice',
			prompt: 'Почему при пожаре нельзя пользоваться лифтом?',
			options: [
				'Может отключиться электропитание, а шахта лифта быстро заполняется дымом',
				'Лифт может не выдержать нагрузки',
				'Лифт едет слишком медленно',
				'Так требуют только правила пользования лифтом',
			],
			correct: 0,
			explain: 'Застрявший лифт в задымлённой шахте — ловушка. Эвакуация — только по лестницам.',
			tags: ['действия'],
		},
		{
			type: 'single_choice',
			prompt: 'Что нужно сообщить диспетчеру пожарной охраны?',
			options: [
				'Точный адрес, что горит, есть ли угроза людям, свою фамилию и телефон',
				'Только адрес',
				'Только свою фамилию и должность',
				'Площадь здания и год постройки',
			],
			correct: 0,
			explain: 'Не кладите трубку первым: диспетчер может задать уточняющие вопросы.',
			tags: ['действия'],
		},
		{
			type: 'ordering',
			prompt: 'Расставьте действия работника при обнаружении пожара по порядку.',
			steps: [
				'Сообщить в пожарную охрану по 101 или 112',
				'Оповестить людей, нажать ручной пожарный извещатель',
				'Организовать эвакуацию людей из опасной зоны',
				'Если это безопасно — тушить очаг первичными средствами',
				'Встретить пожарных и рассказать об очаге и людях внутри',
			],
			explain: 'Сначала вызов и оповещение, затем люди, затем — тушение, если это не угрожает жизни.',
			tags: ['действия'],
		},
		{
			type: 'single_choice',
			prompt: 'Дверь в помещение, где может быть пожар, горячая на ощупь. Что делать?',
			options: [
				'Не открывать, искать другой путь и сообщить пожарной охране',
				'Резко открыть и войти, чтобы осмотреться',
				'Открыть, пригнувшись',
				'Облить дверь водой и открыть',
			],
			correct: 0,
			explain: 'За горячей дверью — пламя; приток воздуха при открытии вызовет вспышку.',
			tags: ['действия'],
		},
		// ситуационная задача — 26
		{
			type: 'open_text',
			prompt:
				'Ситуация: из розетки в соседнем кабинете идёт дым, в кабинете за компьютером работает коллега. Опишите по шагам ваши действия.',
			explain:
				'Образец: предупредить коллегу и вывести его; обесточить розетку (автомат в щитке); сообщить по 101/112 и руководителю; при небольшом очаге — углекислотный или порошковый огнетушитель, не вода; закрыть дверь, при задымлении — эвакуация.',
			points: 4,
			tags: ['ситуационные'],
			answers: {
				good:
					'1) Предупрежу коллегу и выведу из кабинета. 2) Обесточу розетку — отключу автомат в электрощитке этажа. ' +
					'3) Позвоню 112 и сообщу руководителю, нажму ручной извещатель. 4) Если очаг небольшой — потушу углекислотным ' +
					'огнетушителем с расстояния, водой не тушу. 5) Если дым усиливается — закрою дверь и уйду по плану эвакуации.',
				weak: 'Выдерну вилку и залью розетку водой из чайника, потом позову коллег.',
			},
			feedback: {
				good: 'Всё верно и по порядку: люди, обесточивание, вызов, безопасное тушение. Отлично!',
				weak: 'Опасно: воду на электроприборы под напряжением лить нельзя, и сначала нужно вывести коллегу и вызвать пожарную охрану.',
			},
		},
	]

	const fire = await buildCourse(fireCtx, {
		title: 'Пожарная безопасность для работников организации',
		description: doc(
			p(
				'Обязательная программа по мерам пожарной безопасности для всех работников: как возникает пожар, требования ',
				'противопожарного режима, первичные средства тушения, действия при пожаре и эвакуация.',
			),
			ul(
				'17 уроков в 5 разделах, около 4 часов',
				'проверочный тест после каждого раздела и практическое задание',
				'итоговая аттестация: 12 случайных вопросов, проходной балл 80%, три попытки',
			),
		),
		accessDays: 90,
		accessMode: 'sequential',
		publish: true,
		questions: (courseId) => bank(fireCtx, courseId, fireQuestions),
		sections: [
			{
				title: 'Основы пожарной безопасности',
				lessons: [
					{
						title: 'Горение и опасные факторы пожара',
						blocks: [
							{ type: 'heading', text: 'Как возникает пожар' },
							{
								type: 'text',
								body: doc(
									p(
										b('Пожар'),
										' — неконтролируемое горение, причиняющее вред жизни и здоровью людей и имуществу. Для горения нужны три условия — ',
										'так называемый «треугольник огня»:',
									),
									ol(
										p(b('Горючее вещество'), ' — бумага, дерево, ткань, пластик, топливо, газ.'),
										p(b('Окислитель'), ' — чаще всего кислород воздуха.'),
										p(b('Источник зажигания'), ' — открытый огонь, искра, нагретая поверхность, короткое замыкание.'),
									),
									p(
										'Все способы тушения убирают одну из сторон треугольника: охлаждают (вода), изолируют от кислорода ',
										'(пена, покрывало, углекислота) или прекращают подачу горючего (перекрыть газ, обесточить).',
									),
								),
							},
							{ type: 'heading', text: 'Опасные факторы пожара', level: 'h3' },
							{
								type: 'text',
								body: doc(
									ul(
										'пламя и искры',
										'тепловой поток и повышенная температура окружающей среды',
										'повышенная концентрация токсичных продуктов горения и термического разложения',
										'пониженная концентрация кислорода',
										'снижение видимости в дыму',
									),
									p(
										'Сопутствующие проявления: обрушение конструкций, вынос высокого напряжения, взрывы, выход опасных веществ.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'warning',
								body: doc(
									p(
										b('Главная опасность — дым. '),
										'Угарный газ не имеет запаха; 2–3 вдоха густого дыма могут привести к потере сознания. ',
										'Поэтому при пожаре важнее всего быстро уйти из зоны задымления.',
									),
								),
							},
						],
					},
					{
						title: 'Законодательство: кто и за что отвечает',
						blocks: [
							{
								type: 'text',
								body: doc(
									h(3, 'Основные документы'),
									table(
										['Документ', 'Что регулирует'],
										[
											[
												'Федеральный закон № 69-ФЗ «О пожарной безопасности»',
												'общие правовые основы, права и обязанности организаций и граждан',
											],
											[
												'Федеральный закон № 123-ФЗ «Технический регламент о требованиях пожарной безопасности»',
												'классификация пожаров, требования к зданиям и системам защиты',
											],
											[
												'Правила противопожарного режима в РФ',
												'что обязан обеспечить руководитель и что запрещено на объектах',
											],
											[
												'Порядок обучения лиц мерам пожарной безопасности',
												'виды противопожарных инструктажей и обучение по программам',
											],
										],
									),
									h(3, 'Руководитель организации'),
									ul(
										'назначает ответственного за пожарную безопасность',
										'утверждает инструкцию о мерах пожарной безопасности',
										'организует инструктажи и обучение работников',
										'обеспечивает исправность систем противопожарной защиты и первичных средств тушения',
									),
									h(3, 'Работник'),
									ul(
										'соблюдает требования пожарной безопасности и инструкции',
										'знает расположение средств тушения и пути эвакуации',
										'при обнаружении пожара сообщает в пожарную охрану и принимает посильные меры по спасению людей',
									),
								),
							},
							{
								type: 'callout',
								tone: 'info',
								body: line(
									'За нарушение требований пожарной безопасности предусмотрена административная ответственность, а если пожар повлёк вред здоровью или гибель людей — уголовная.',
								),
							},
						],
					},
					{
						title: 'Проверьте себя: основы',
						graded: true,
						blocks: [
							{
								type: 'text',
								body: line(
									'5 вопросов по первому разделу. Попыток сколько угодно, проходной балл — 75%. Правильные ответы покажем сразу после отправки.',
								),
							},
							{ type: 'quiz', pick: [0, 1, 2, 3, 4], passScorePct: 75, attemptsLimit: 0, timeLimitSec: null },
						],
					},
				],
			},
			{
				title: 'Противопожарный режим в организации',
				lessons: [
					{
						title: 'Противопожарные инструктажи и обучение',
						blocks: [
							{
								type: 'text',
								body: doc(
									p('Каждый работник допускается к работе только после противопожарного инструктажа.'),
									table(
										['Инструктаж', 'Когда проводится'],
										[
											['Вводный', 'при приёме на работу, до начала работы'],
											['Первичный на рабочем месте', 'на рабочем месте до начала самостоятельной работы'],
											['Повторный', 'не реже раза в год (на пожароопасных производствах — раза в полгода)'],
											['Внеплановый', 'при изменении требований, технологии, после пожара или нарушения'],
											['Целевой', 'перед разовыми работами повышенной пожарной опасности, например огневыми'],
										],
									),
									p(
										'Руководители и ответственные за пожарную безопасность, кроме того, проходят обучение по дополнительным ',
										'профессиональным программам.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'success',
								body: line(
									'Проведение инструктажа фиксируется в журнале учёта противопожарных инструктажей с подписями инструктируемого и инструктирующего.',
								),
							},
						],
					},
					{
						title: 'Требования пожарной безопасности на рабочем месте',
						blocks: [
							{ type: 'heading', text: 'Электрооборудование' },
							{
								type: 'text',
								body: doc(
									ul(
										'не пользуйтесь розетками, вилками и проводами с повреждённой изоляцией',
										'не включайте несколько мощных приборов в один удлинитель; удлинитель — не постоянная проводка',
										'не применяйте самодельные электронагреватели и «жучки» вместо предохранителей',
										'уходя, выключайте электроприборы, если они не предназначены для круглосуточной работы',
									),
								),
							},
							{ type: 'heading', text: 'Курение и открытый огонь' },
							{
								type: 'text',
								body: doc(
									p(
										'Курить можно только в местах, обозначенных знаком «Место для курения». Огневые работы — сварка, резка, пайка — ',
										'проводятся только по наряду-допуску после целевого инструктажа.',
									),
								),
							},
							{ type: 'heading', text: 'Порядок на рабочем месте' },
							{
								type: 'text',
								body: doc(
									ul(
										'не храните горючие жидкости и баллоны с газом в офисах и на путях эвакуации',
										'не загромождайте доступ к огнетушителям, пожарным кранам и электрощитам',
										'сгораемые отходы и упаковку убирайте ежедневно',
									),
								),
							},
							{
								type: 'callout',
								tone: 'warning',
								body: line('Около трети пожаров в офисах начинаются с электропроводки и перегруженных удлинителей.'),
							},
						],
					},
					{
						title: 'Пути эвакуации и знаки пожарной безопасности',
						blocks: [
							{
								type: 'text',
								body: doc(
									p(
										'На каждом этаже размещается ',
										b('план эвакуации'),
										': на нём отмечены «Вы находитесь здесь», пути к выходам, ',
										'огнетушители, пожарные краны и ручные извещатели. Изучите план своего этажа заранее — во время пожара не будет времени.',
									),
									table(
										['Цвет знака', 'Что означает', 'Примеры'],
										[
											['Зелёный', 'эвакуационные знаки', '«Выход здесь», направление движения к выходу'],
											[
												'Красный',
												'знаки пожарной безопасности',
												'огнетушитель, пожарный кран, телефон для вызова пожарной охраны',
											],
											[
												'Красный с перечёркиванием',
												'запрещающие',
												'«Запрещается курить», «Запрещается пользоваться открытым огнём»',
											],
										],
									),
									h(3, 'Требования к путям эвакуации'),
									ul(
										'коридоры, лестницы и выходы свободны',
										'двери эвакуационных выходов открываются изнутри без ключа',
										'противопожарные двери оснащены доводчиками и не фиксируются в открытом положении',
										'аварийное освещение и световые указатели «Выход» исправны',
									),
								),
							},
						],
					},
					{
						title: 'Проверьте себя: противопожарный режим',
						graded: true,
						blocks: [
							{
								type: 'text',
								body: line('7 вопросов по второму разделу. Попыток сколько угодно, проходной балл — 70%.'),
							},
							{ type: 'quiz', pick: [5, 6, 7, 8, 9, 10, 11], passScorePct: 70, attemptsLimit: 0, timeLimitSec: null },
						],
					},
				],
			},
			{
				title: 'Первичные средства пожаротушения',
				lessons: [
					{
						title: 'Классы пожаров и виды огнетушителей',
						blocks: [
							{ type: 'heading', text: 'Классы пожаров' },
							{
								type: 'text',
								body: doc(
									table(
										['Класс', 'Что горит', 'Примеры'],
										[
											['A', 'твёрдые горючие вещества', 'дерево, бумага, ткань, пластик'],
											['B', 'горючие жидкости и плавящиеся вещества', 'бензин, масло, краска, парафин'],
											['C', 'газы', 'бытовой газ, пропан, водород'],
											['D', 'металлы', 'алюминиевая стружка, магний, натрий'],
											['E', 'электроустановки под напряжением', 'щиты, кабели, оргтехника'],
										],
									),
								),
							},
							{ type: 'heading', text: 'Виды огнетушителей' },
							{
								type: 'text',
								body: doc(
									table(
										['Огнетушитель', 'Классы пожаров', 'Особенности'],
										[
											[
												'Порошковый (ОП)',
												'A, B, C, E — до 1000 В',
												'универсальный; порошок сильно загрязняет помещение и технику',
											],
											[
												'Углекислотный (ОУ)',
												'B, C, E — до 10 кВ',
												'не оставляет следов — для оргтехники и серверных; раструб охлаждается до −70 °C',
											],
											['Воздушно-пенный (ОВП)', 'A, B', 'нельзя для электроустановок под напряжением'],
											['Водный (ОВ)', 'A', 'нельзя для электроустановок и горючих жидкостей'],
										],
									),
									p(
										'Тип огнетушителя указан на корпусе: буквы — вид, цифра — масса заряда в килограммах (например, ОП-4, ОУ-5).',
									),
								),
							},
						],
					},
					{
						title: 'Как пользоваться огнетушителем',
						blocks: [
							{
								type: 'text',
								body: doc(
									h(3, 'Четыре шага'),
									ol(
										p(b('Сорвите пломбу и выдерните чеку.')),
										p(b('Направьте шланг или раструб'), ' на основание пламени, а не на дым.'),
										p(b('Нажмите на рычаг'), ' — подача начнётся через 2–3 секунды у порошковых огнетушителей.'),
										p(b('Тушите с края к центру'), ', короткими порциями, приближаясь по мере тушения.'),
									),
									h(3, 'Правила безопасности'),
									ul(
										'подходите к очагу с наветренной стороны — ветер в спину',
										'держите огнетушитель вертикально',
										'горящую поверхность жидкости тушат сверху, вертикальную — снизу вверх',
										'несколько огнетушителей — применяйте одновременно',
										'после тушения не уходите сразу: возможно повторное возгорание',
									),
								),
							},
							{
								type: 'callout',
								tone: 'warning',
								body: line(
									'Углекислотный огнетушитель держите только за ручку: раструб покрывается инеем, голой рукой можно получить обморожение.',
								),
							},
							{
								type: 'callout',
								tone: 'info',
								body: line(
									'Огнетушитель ОП-4 работает около 10 секунд. Если за это время очаг не потушен — уходите и закрывайте за собой дверь.',
								),
							},
						],
					},
					{
						title: 'Пожарный кран, покрывало и другие средства',
						blocks: [
							{
								type: 'text',
								body: doc(
									h(3, 'Внутренний пожарный кран'),
									p(
										'Шкаф с краном, рукавом и стволом. Работают вдвоём: первый раскатывает рукав к очагу и держит ствол, второй ',
										'по команде открывает вентиль. Водой из крана нельзя тушить электрооборудование под напряжением.',
									),
									h(3, 'Противопожарное покрывало'),
									p(
										'Плотная негорючая ткань. Подходит для небольшого очага, горящей посуды с маслом и для тушения одежды на человеке: ',
										'накройте очаг от себя, чтобы пламя не ушло на руки.',
									),
									h(3, 'Песок и ящик с песком'),
									p(
										'Для небольших проливов горючих жидкостей на производстве и складах: песок засыпают от краёв к центру.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'success',
								body: line(
									'Первичные средства нужны, чтобы потушить пожар в самом начале. Если огонь распространяется — ваша задача эвакуироваться.',
								),
							},
						],
					},
					{
						title: 'Практика: средства тушения на вашем этаже',
						graded: true,
						blocks: [
							{
								type: 'text',
								body: doc(
									p('Проверьте, готовы ли средства тушения рядом с вашим рабочим местом. Это займёт 10–15 минут.'),
								),
							},
							{
								type: 'assignment',
								prompt: doc(
									p(b('Задание. '), 'Найдите ближайшие к рабочему месту огнетушитель и пожарный кран и опишите:'),
									ol(
										'тип и марку огнетушителя (например, ОП-4), где он размещён',
										'состояние: пломба и чека, стрелка манометра, целостность шланга, дата следующей перезарядки',
										'где находится ближайший пожарный кран и ручной пожарный извещатель',
										'свой путь эвакуации до ближайшего выхода — сколько метров и сколько дверей',
									),
									p('Если нашли неисправность — укажите, кому сообщили. Можно приложить фото.'),
								),
							},
						],
					},
					{
						title: 'Проверьте себя: средства тушения',
						graded: true,
						blocks: [
							{
								type: 'text',
								body: line('8 вопросов по третьему разделу. Попыток сколько угодно, проходной балл — 70%.'),
							},
							{
								type: 'quiz',
								pick: [12, 13, 14, 15, 16, 17, 18, 19],
								passScorePct: 70,
								attemptsLimit: 0,
								timeLimitSec: null,
							},
						],
					},
				],
			},
			{
				title: 'Действия при пожаре',
				lessons: [
					{
						title: 'Алгоритм действий при пожаре',
						blocks: [
							{
								type: 'text',
								body: doc(
									ol(
										p(
											b('Сообщите в пожарную охрану'),
											' — 101 или 112: адрес, что горит, есть ли люди в опасности, ваши фамилия и телефон.',
										),
										p(b('Оповестите людей'), ' — голосом и ручным пожарным извещателем.'),
										p(b('Организуйте эвакуацию'), ' — в первую очередь тех, кому нужна помощь.'),
										p(b('Если безопасно — тушите'), ' первичными средствами; обесточьте оборудование.'),
										p(b('Встретьте пожарных'), ' и расскажите, где очаг и остались ли люди внутри.'),
									),
								),
							},
							{
								type: 'callout',
								tone: 'warning',
								body: line(
									'Не тратьте время на сбор вещей и не возвращайтесь в горящее здание. Жизнь людей важнее имущества.',
								),
							},
						],
					},
					{
						title: 'Эвакуация и поведение в дыму',
						blocks: [
							{
								type: 'text',
								body: doc(
									ul(
										'двигайтесь к выходу по плану эвакуации и зелёным знакам',
										'в дыму — пригнувшись или ползком: у пола воздух чище',
										'дышите через влажную ткань, держитесь рукой за стену',
										'закрывайте за собой двери — это задерживает дым и огонь',
										'не пользуйтесь лифтом',
										'перед тем как открыть дверь, проверьте её тыльной стороной ладони: горячую дверь не открывайте',
									),
									h(3, 'Если путь отрезан'),
									p(
										'Вернитесь в помещение с окном, плотно закройте дверь, заткните щели мокрой тканью, позвоните 112 и сообщите, ',
										'где вы находитесь; подавайте сигналы из окна. Не прыгайте из окон выше второго этажа.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'info',
								body: line(
									'После выхода из здания идите к месту сбора и сообщите руководителю, что вы в безопасности, — так спасатели не будут искать вас внутри.',
								),
							},
						],
					},
					{
						title: 'Первая помощь пострадавшим при пожаре',
						blocks: [
							{
								type: 'text',
								body: doc(
									h(3, 'Отравление дымом'),
									p(
										'Вынесите пострадавшего на свежий воздух, расстегните стесняющую одежду, вызовите скорую. ',
										'Если человек без сознания и не дышит — начните сердечно-лёгочную реанимацию.',
									),
									h(3, 'Ожоги'),
									p(
										'Охлаждайте ожог прохладной проточной водой не менее 20 минут, закройте чистой повязкой. ',
										'Не вскрывайте пузыри, не смазывайте ожог маслом и кремами, не отрывайте прилипшую одежду.',
									),
								),
							},
							{
								type: 'callout',
								tone: 'success',
								body: line('Подробно — в курсе «Оказание первой помощи пострадавшим».'),
							},
						],
					},
					{
						title: 'Разбор ситуаций',
						graded: true,
						blocks: [
							{
								type: 'text',
								body: doc(
									p(
										'6 вопросов и ситуационная задача с развёрнутым ответом — её проверит преподаватель. ',
										'Проходной балл — 70%, три попытки.',
									),
								),
							},
							{
								type: 'quiz',
								pick: [20, 21, 22, 23, 24, 25, 26],
								passScorePct: 70,
								attemptsLimit: 3,
								timeLimitSec: null,
							},
						],
					},
				],
			},
			{
				title: 'Итоговая аттестация',
				lessons: [
					{
						title: 'Итоговый тест',
						graded: true,
						blocks: [
							{
								type: 'callout',
								tone: 'info',
								body: doc(
									p(
										b('Правила: '),
										'12 случайных вопросов из всех разделов, 20 минут, три попытки, проходной балл — 80%. ',
										'Правильные ответы откроются после успешной сдачи.',
									),
								),
							},
							{
								type: 'quiz',
								randomTags: ['основы', 'режим', 'средства', 'действия'],
								randomCount: 12,
								passScorePct: 80,
								attemptsLimit: 3,
								timeLimitSec: 20 * 60,
								showCorrect: 'after_pass',
							},
						],
					},
				],
			},
		],
	})

	// Сроки сдачи (4.4): практика и итоговые тесты — через N дней от старта потока или зачисления
	const deadlines: [string, number][] = [
		[courseA.lessonIds[2] as string, 10],
		[courseA.lessonIds[5] as string, 20],
		[fire.lessonIds[10] as string, 14],
		[fire.lessonIds[16] as string, 21],
	]
	for (const [id, days] of deadlines) await updateLessonSettings(as('teacher', ago(40)), { id, deadlineDays: days })

	// Сертификат (4.7) у «Пожарной безопасности»; выдача прошедшим — в конце (подписчиков событий в сиде нет)
	{
		const {
			courseId,
			signatureUrl: _s,
			backgroundUrl: _b,
			...fields
		} = await getTemplate(as('teacher', ago(40)), fire.courseId)
		await saveTemplate(as('teacher', ago(40)), {
			...fields,
			courseId,
			enabled: true,
			signerName: 'Марина Соколова',
			signerTitle: 'Директор учебного центра',
		})
	}

	// Потоки (4.2) — до зачислений: ученики зачисляются сразу в поток. У куратора Анны Кузнецовой свои потоки;
	// кто без потока, тот виден только преподавателям.
	const groupOf = new Map<string, string>()
	async function groupUp(
		courseId: string,
		input: { title: string; startsAgo: number; curators: string[]; students: string[] },
	) {
		const group = await createGroup(as('teacher', ago(input.startsAgo + 2)), {
			courseId,
			title: input.title,
			startsAt: ago(input.startsAgo),
			endsAt: ago(input.startsAgo - 45),
			accessDays: null,
			curatorIds: input.curators.map((k) => memberIds.get(k) as string),
		})
		for (const key of input.students) groupOf.set(`${courseId}:${key}`, group.id)
	}
	await groupUp(fire.courseId, {
		title: 'Поток — октябрь',
		startsAgo: 31,
		curators: ['curator'],
		students: ['petrov', 'zakharova', 'smirnova', 'popova', 'kozlov', 'lebedev'],
	})
	await groupUp(fire.courseId, {
		title: 'Поток — ноябрь',
		startsAgo: 16,
		curators: ['curator', 'teacher'],
		students: ['novikova', 'morozov', 'vasilieva', 'fedorov'],
	})
	await groupUp(courseA.courseId, {
		title: 'Руководители участков',
		startsAgo: 25,
		curators: ['curator'],
		students: ['petrov', 'smirnova', 'popova', 'kozlov', 'lebedev', 'vasilieva'],
	})
	await groupUp(courseA.courseId, {
		title: 'Специалисты',
		startsAgo: 13,
		curators: ['teacher'],
		students: ['novikova', 'morozov', 'fedorov', 'zakharova'],
	})

	// ═══ Ученики и прогресс ════════════════════════════════════════════════════════════════════════════════

	const [a1, a2, a3, a4, a5, a6] = courseA.lessonIds as [string, string, string, string, string, string]
	const aAssignment = await blockKeyOf(a3, 'assignment')
	const aQuiz = await blockKeyOf(a6, 'quiz')
	const enrollAs = (staff: string, student: string, courseId: string, at: Date, source: 'manual' | 'link' = 'manual') =>
		enroll(as(staff, at), {
			memberId: memberIds.get(student) as string,
			courseId,
			source,
			groupId: groupOf.get(`${courseId}:${student}`) ?? null,
		})

	const answerRisk = (good: boolean) =>
		good
			? doc(
					p('Рабочее место — участок механической обработки.'),
					ol(
						'Вращающиеся части станка — риск высокий — защитный экран и блокировка пуска при открытом кожухе.',
						'Стружка и брызги СОЖ в глаза — риск средний — защитные очки, щиток на станке.',
						'Шум 85 дБА — риск средний — противошумные наушники, перерывы в тихой зоне.',
					),
				)
			: doc(p('Опасности: станок, шум. Риск средний. Меры: быть внимательным.'))

	async function submissionOf(key: string, lessonId: string, blockKey: string) {
		const [row] = await tx
			.select({ id: submissions.id })
			.from(submissions)
			.innerJoin(enrollments, eq(enrollments.id, submissions.enrollmentId))
			.where(
				and(
					eq(enrollments.memberId, memberIds.get(key) as string),
					eq(submissions.lessonId, lessonId),
					eq(submissions.blockKey, blockKey),
				),
			)
			.orderBy(desc(submissions.submittedAt))
			.limit(1)
		if (!row) throw new Error(`нет сдачи у ${key}`)
		return row.id
	}

	async function courseAFor(
		key: string,
		start: number,
		plan: { review?: 'accept' | 'needs_revision' | 'pending'; quiz?: Quality[]; grade?: boolean },
	) {
		const staff = key === 'grigoriev' || key === 'zakharova' ? 'admin' : 'teacher'
		await enrollAs(staff, key, courseA.courseId, ago(start))
		await study(key, [a1, a2], ago(start - 1))
		if (!plan.review) return
		await openLesson(as(key, ago(start - 3)), a3)
		await submitAssignment(as(key, ago(start - 3, 30)), {
			lessonId: a3,
			blockKey: aAssignment,
			body: answerRisk(plan.review !== 'needs_revision'),
			fileIds: [],
		})
		if (plan.review === 'pending') return
		const submissionId = await submissionOf(key, a3, aAssignment)
		if (plan.review === 'needs_revision') {
			await reviewSubmission(as('curator', ago(start - 4)), {
				submissionId,
				decision: 'needs_revision',
				comment: doc(
					p(
						'Перечень слишком общий. Назовите конкретные опасности, оцените риск каждой и предложите меру — по образцу из урока.',
					),
				),
			})
			await replyAsStudent(as(key, ago(start - 4, 90)), {
				lessonId: a3,
				blockKey: aAssignment,
				body: line('Поняла, переделаю после смены и отправлю заново.'),
				fileIds: [],
			})
			return
		}
		await reviewSubmission(as('teacher', ago(start - 4)), {
			submissionId,
			decision: 'accept',
			comment: line('Отлично: опасности конкретные, меры выстроены по иерархии. Принято.'),
		})
		await study(key, [a4, a5], ago(start - 5))
		for (const [i, quality] of (plan.quiz ?? []).entries()) {
			const attempt = await takeQuiz(key, a6, aQuiz, ago(start - 7 - i), quality)
			if (plan.grade) await gradeOpen(attempt, ago(start - 7 - i, 240), quality)
		}
	}

	// Программа А: трое прошли, один ждёт ручной проверки теста, один провалил первую попытку, трое ждут проверки ДЗ,
	// одна — на доработке, двое только начали, у одного доступ отозван.
	await courseAFor('petrov', 24, { review: 'accept', quiz: ['good'], grade: true })
	await courseAFor('smirnova', 22, { review: 'accept', quiz: ['good'], grade: true })
	await courseAFor('popova', 21, { review: 'accept', quiz: ['weak', 'good'], grade: true })
	await courseAFor('kozlov', 18, { review: 'accept', quiz: ['good'] })
	await courseAFor('lebedev', 16, { review: 'accept', quiz: ['weak'], grade: true })
	await courseAFor('novikova', 12, { review: 'pending' })
	await courseAFor('morozov', 11, { review: 'pending' })
	await courseAFor('fedorov', 9, { review: 'pending' })
	await courseAFor('vasilieva', 13, { review: 'needs_revision' })
	await courseAFor('alekseeva', 4, {})
	await courseAFor('grigoriev', 3, {})
	await courseAFor('zakharova', 20, {})
	const [zakharovaA] = await tx
		.select({ id: enrollments.id })
		.from(enrollments)
		.where(
			and(eq(enrollments.memberId, memberIds.get('zakharova') as string), eq(enrollments.courseId, courseA.courseId)),
		)
	if (zakharovaA) await revokeEnrollment(as('admin', ago(6)), zakharovaA.id)

	// Первая помощь: открытый курс, кто-то идёт не по порядку.
	const [f1, f2, f3, f4, f5] = courseFirstAid.lessonIds as [string, string, string, string, string]
	const fQuiz = await blockKeyOf(f5, 'quiz')
	const firstAid: [string, number, string[], Quality[]][] = [
		['petrov', 20, [f1, f2, f3, f4], ['good']],
		['kozlov', 19, [f1, f2, f3, f4], ['weak', 'good']],
		['lebedev', 17, [f1, f2, f3, f4], ['good']],
		['morozov', 15, [f1, f2, f3], []],
		['novikova', 14, [f1, f2, f4], ['weak']],
		['fedorov', 10, [f1, f2], []],
		['grigoriev', 7, [f1], []],
		['alekseeva', 2, [], []],
	]
	for (const [key, start, opened, quiz] of firstAid) {
		await enrollAs('medic', key, courseFirstAid.courseId, ago(start), start < 8 ? 'link' : 'manual')
		await study(key, opened, ago(start - 1))
		for (const [i, quality] of quiz.entries()) await takeQuiz(key, f5, fQuiz, ago(start - 5 - i), quality)
	}

	// СИЗ: курс без срока, практика с проверкой.
	const [s1, s2, s3] = courseSiz.lessonIds as [string, string, string]
	const sAssignment = await blockKeyOf(s3, 'assignment')
	const siz: [string, number, 'accept' | 'pending' | null][] = [
		['lebedev', 15, 'accept'],
		['morozov', 12, 'pending'],
		['kozlov', 8, 'pending'],
		['grigoriev', 5, null],
	]
	for (const [key, start, review] of siz) {
		await enrollAs('teacher', key, courseSiz.courseId, ago(start))
		await study(key, [s1, s2], ago(start - 1))
		if (!review) continue
		await openLesson(as(key, ago(start - 3)), s3)
		await submitAssignment(as(key, ago(start - 3, 20)), {
			lessonId: s3,
			blockKey: sAssignment,
			body: doc(
				ul(
					'Каска: трещин нет, срок годности до 2028 года — исправна.',
					'Очки: царапины на стёклах — заменил на складе.',
					'Перчатки с полимерным покрытием: прорыв на указательном пальце — заменил.',
				),
			),
			fileIds: [],
		})
		if (review === 'accept')
			await reviewSubmission(as('teacher', ago(start - 4)), {
				submissionId: await submissionOf(key, s3, sAssignment),
				decision: 'accept',
				comment: line('Верно: дефектные СИЗ к работе не допускаются. Принято.'),
			})
	}

	// Пожарная безопасность: обязательна для всех — у каждого своя история прохождения.
	const fireAnswer = (good: boolean) =>
		good
			? doc(
					ol(
						'Огнетушитель ОП-4(з) в коридоре у кабинета 214, на кронштейне, высота ручки около 1,2 м.',
						'Пломба и чека на месте, стрелка манометра в зелёной зоне, шланг целый; следующая перезарядка — март 2027.',
						'Пожарный кран ПК-12 — в нише у лестницы, ручной извещатель — рядом с ним.',
						'Путь эвакуации: 25 м по коридору, две двери, выход на лестницу № 2, знаки «Выход» светятся.',
					),
				)
			: doc(p('Огнетушитель есть в коридоре, вроде красный. Пожарный кран не нашёл.'))

	/**
	 * Пройти курс урок за уроком до `upto` (не включая): просмотр — открыть, тест — сдать (в `weak` — сначала неудачная попытка),
	 * задание — сдать и получить решение. `stop` — где остановиться: работа ждёт проверки, на доработке, тест ждёт ручной
	 * оценки или попытка не сдана.
	 */
	async function walk(
		key: string,
		course: { lessonIds: string[]; kinds: ('view' | 'quiz' | 'assignment')[] },
		start: number,
		plan: {
			upto?: number
			weak?: number[]
			stop?: { at: number; reason: 'review' | 'revision' | 'grading' | 'failed' }
		} = {},
	) {
		const upto = plan.upto ?? course.lessonIds.length
		for (let i = 0; i < upto; i++) {
			const lessonId = course.lessonIds[i] as string
			const at = ago(start - i * 0.6)
			const kind = course.kinds[i]
			const stopHere = plan.stop?.at === i ? plan.stop.reason : null
			if (kind === 'view') {
				await openLesson(as(key, at), lessonId)
				continue
			}
			await openLesson(as(key, at), lessonId)
			if (kind === 'assignment') {
				const blockKey = await blockKeyOf(lessonId, 'assignment')
				await submitAssignment(as(key, new Date(at.getTime() + 25 * MIN)), {
					lessonId,
					blockKey,
					body: fireAnswer(stopHere !== 'revision'),
					fileIds: [],
				})
				if (stopHere === 'review') return
				const submissionId = await submissionOf(key, lessonId, blockKey)
				if (stopHere === 'revision') {
					await reviewSubmission(as('teacher', new Date(at.getTime() + 6 * 60 * MIN)), {
						submissionId,
						decision: 'needs_revision',
						comment: doc(
							p(
								'Не хватает деталей: укажите марку огнетушителя, состояние пломбы и манометра, дату перезарядки. ',
								'Пожарный кран обычно рядом с лестницей — посмотрите ещё раз.',
							),
						),
					})
					return
				}
				await reviewSubmission(as('teacher', new Date(at.getTime() + 6 * 60 * MIN)), {
					submissionId,
					decision: 'accept',
					comment: line('Отлично, всё проверено. Хорошо, что отметили путь эвакуации в метрах.'),
				})
				continue
			}
			const blockKey = await blockKeyOf(lessonId, 'quiz')
			const tries: Quality[] = plan.weak?.includes(i) ? ['weak', 'good'] : ['good']
			if (stopHere === 'failed') tries.splice(1)
			for (const [n, quality] of tries.entries()) {
				const attempt = await takeQuiz(key, lessonId, blockKey, new Date(at.getTime() + n * 90 * MIN), quality)
				if (stopHere === 'grading' || stopHere === 'failed') return
				await gradeOpen(attempt, new Date(at.getTime() + n * 90 * MIN + 4 * 60 * MIN), quality)
			}
		}
	}

	const fireLink = (key: string) => (['grigoriev', 'alekseeva'].includes(key) ? 'link' : 'manual')
	const firePlans: [string, number, Parameters<typeof walk>[3]][] = [
		['petrov', 30, {}],
		['zakharova', 29, { weak: [2] }],
		['smirnova', 27, { weak: [16] }],
		['popova', 26, { weak: [6, 11] }],
		['kozlov', 22, { upto: 17, weak: [16], stop: { at: 16, reason: 'failed' } }],
		['lebedev', 19, { upto: 16, stop: { at: 15, reason: 'grading' } }],
		['novikova', 15, { upto: 11, stop: { at: 10, reason: 'review' } }],
		['morozov', 14, { upto: 11, stop: { at: 10, reason: 'revision' } }],
		['vasilieva', 10, { upto: 9, weak: [6] }],
		['fedorov', 8, { upto: 3, weak: [2] }],
		['grigoriev', 5, { upto: 7, weak: [6], stop: { at: 6, reason: 'failed' } }],
		['alekseeva', 2, { upto: 1 }],
	]
	for (const [key, start, plan] of firePlans) {
		await enrollAs(key === 'grigoriev' ? 'admin' : 'teacher', key, fire.courseId, ago(start + 1), fireLink(key))
		await walk(key, fire, start, plan)
	}

	// Ссылки-приглашения: на первую помощь (для новых сотрудников), программу А и пожарную безопасность.
	const linkFirstAid = await createLinkInvite(as('medic', ago(8)), {
		courseId: courseFirstAid.courseId,
		expiresInDays: 30,
		maxUses: 50,
	})
	const linkA = await createLinkInvite(as('teacher', ago(1)), { courseId: courseA.courseId, expiresInDays: 14 })
	const linkFire = await createLinkInvite(as('admin', ago(3)), { courseId: fire.courseId, expiresInDays: 30 })
	// сертификаты прошедшим «Пожарную безопасность»: номера сейчас, PDF напечатает воркер `pnpm dev`
	const issued = await issueCompleted(as('teacher'), fire.courseId)
	console.log(`сертификаты «Пожарной безопасности»: выдано ${issued.issued}`)
	console.log(
		`ссылки-приглашения:\n  первая помощь — ${linkFirstAid.url}\n  программа А   — ${linkA.url}\n  пожарная      — ${linkFire.url}`,
	)
})

console.log(
	[
		`db:seed:trud — ok: школа «${school.name}» — http://${SLUG}.dinastia.localhost:5173`,
		`пароль у всех — ${PASSWORD} (или вход по ссылке на почту, письма — http://localhost:8025)`,
		'  владелец       owner@trud.local      Марина Соколова',
		'  администратор  admin@trud.local      Денис Орлов',
		'  преподаватели  teacher@trud.local    Сергей Волков (программа А, СИЗ, пожарная безопасность)',
		'                 medic@trud.local      Елена Миронова (первая помощь)',
		'  куратор        curator@trud.local    Анна Кузнецова',
		`  ученики        <фамилия>@trud.local  ${STUDENTS.map(([k]) => k).join(', ')}`,
	].join('\n'),
)
// выдача сертификатов поставила задачи PDF — соединение очереди закрыть, иначе процесс не завершится
await stopBoss()
await pool.end()
