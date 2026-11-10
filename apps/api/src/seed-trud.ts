// pnpm db:seed:trud — демо-школа по охране труда для показа (скилл local-env). Всё — через сервисы, как из запросов
// сотрудников и учеников, с датами за последние недели (ctx.now). Школа уже есть — ничего не делает; пересоздать:
// pnpm db:reset && pnpm db:seed && pnpm db:seed:trud.

import { type RichTextDoc, toPlainText } from '@dinastia/contracts/common'
import type { MemberRole } from '@dinastia/contracts/schools'
import { and, desc, eq } from 'drizzle-orm'
import { auth } from './kernel/auth/auth.ts'
import { users } from './kernel/auth/schema.ts'
import { config } from './kernel/config.ts'
import type { SchoolCtx } from './kernel/context.ts'
import { db, pool, type Tx } from './kernel/db/client.ts'
import { withTenant } from './kernel/db/tenant.ts'
import { log } from './kernel/log.ts'
import { members } from './kernel/members/schema.ts'
import { tenantCtx } from './kernel/tenant-ctx.ts'
import { gradeAttempt } from './modules/assessments/grading.service.ts'
import { createBankQuestion } from './modules/assessments/question.service.ts'
import { saveAnswer, startAttempt, submitAttempt } from './modules/assessments/quiz.service.ts'
import { submissions } from './modules/assessments/schema.ts'
import { replyAsStudent, reviewSubmission, submitAssignment } from './modules/assessments/submission.service.ts'
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
		| { type: 'quiz'; questionIds: string[]; passScorePct: number; attemptsLimit: number; timeLimitSec: number | null }

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
											selection: 'fixed',
											randomCount: 5,
											attemptsLimit: spec.attemptsLimit,
											passScorePct: spec.passScorePct,
											timeLimitSec: spec.timeLimitSec,
											shuffleQuestions: false,
											shuffleOptions: true,
											showCorrect: 'after_submit',
											questions: spec.questionIds.map((questionId) => ({ questionId })),
											tags: [],
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
		const lessonIds: string[] = []
		for (const section of input.sections) {
			const s = await createSection(ctx, { courseId: course.id, title: section.title })
			for (const spec of section.lessons) {
				const lesson = await createLesson(ctx, { sectionId: s.id, title: spec.title })
				const blocks = spec.blocks.map((x) => (x.type === 'quiz' ? { ...x, questionIds } : x))
				await addBlocks(ctx, lesson.id, blocks)
				if (spec.graded) await updateLessonSettings(ctx, { id: lesson.id, completionRule: 'all_blocks' })
				if (input.publish) await publishLesson(ctx, lesson.id)
				lessonIds.push(lesson.id)
			}
		}
		if (input.publish) await publishCourse(ctx, course.id)
		return { courseId: course.id, lessonIds }
	}

	// ── банк вопросов ───────────────────────────────────────────────────────────────────────────────────────

	type Q =
		| { type: 'single_choice'; prompt: string; options: string[]; correct: number; explain: string; tags: string[] }
		| { type: 'multiple_choice'; prompt: string; options: string[]; correct: number[]; explain: string; tags: string[] }
		| { type: 'text_input'; prompt: string; accepted: string[]; explain: string; tags: string[] }
		| { type: 'open_text'; prompt: string; explain: string; points: number; tags: string[] }

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

	/** Попытка теста: `good` отвечает верно, `weak` — ошибается в выборе вариантов. */
	async function takeQuiz(key: string, lessonId: string, blockKey: string, at: Date, quality: Quality) {
		const attempt = await startAttempt(as(key, at), { lessonId, blockKey })
		for (const aq of attempt.questions) {
			const data = aq.data as { prompt: RichTextDoc; options?: { id: string; body: RichTextDoc }[] }
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
							: { text: OPEN_ANSWERS[quality] }
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
			.map((aq) => ({
				attemptQuestionId: aq.id,
				score: quality === 'good' ? aq.points : 1,
				feedback:
					quality === 'good'
						? line('Хороший разбор: опасности названы конкретно, меры реалистичны.')
						: line('Слишком общо — назовите конкретные опасности и меры по каждой.'),
			}))
		await gradeAttempt(as('teacher', at), { attemptId: attempt.attempt.id, grades })
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
							{ type: 'quiz', questionIds: [], passScorePct: 70, attemptsLimit: 3, timeLimitSec: 20 * 60 },
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
							{ type: 'quiz', questionIds: [], passScorePct: 80, attemptsLimit: 0, timeLimitSec: null },
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

	// ═══ Ученики и прогресс ════════════════════════════════════════════════════════════════════════════════

	const [a1, a2, a3, a4, a5, a6] = courseA.lessonIds as [string, string, string, string, string, string]
	const aAssignment = await blockKeyOf(a3, 'assignment')
	const aQuiz = await blockKeyOf(a6, 'quiz')
	const enrollAs = (staff: string, student: string, courseId: string, at: Date, source: 'manual' | 'link' = 'manual') =>
		enroll(as(staff, at), { memberId: memberIds.get(student) as string, courseId, source })

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

	// Ссылки-приглашения: на первую помощь (для новых сотрудников) и на программу А.
	const linkFirstAid = await createLinkInvite(as('medic', ago(8)), {
		courseId: courseFirstAid.courseId,
		expiresInDays: 30,
		maxUses: 50,
	})
	const linkA = await createLinkInvite(as('teacher', ago(1)), { courseId: courseA.courseId, expiresInDays: 14 })
	console.log(`ссылки-приглашения:\n  первая помощь — ${linkFirstAid.url}\n  программа А   — ${linkA.url}`)
})

console.log(
	[
		`db:seed:trud — ok: школа «${school.name}» — http://${SLUG}.dinastia.localhost:5173`,
		`пароль у всех — ${PASSWORD} (или вход по ссылке на почту, письма — http://localhost:8025)`,
		'  владелец       owner@trud.local      Марина Соколова',
		'  администратор  admin@trud.local      Денис Орлов',
		'  преподаватели  teacher@trud.local    Сергей Волков (программа А, СИЗ)',
		'                 medic@trud.local      Елена Миронова (первая помощь)',
		'  куратор        curator@trud.local    Анна Кузнецова',
		`  ученики        <фамилия>@trud.local  ${STUDENTS.map(([k]) => k).join(', ')}`,
	].join('\n'),
)
await pool.end()
