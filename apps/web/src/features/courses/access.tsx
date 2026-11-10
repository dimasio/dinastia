// Доступ к урокам (карточка 4.3): режим курса в конструкторе курса и «Когда урок открывается» в конструкторе урока; «Срок сдачи»
// урока (4.4). Действуют сразу, без публикации; доступность и сроки ученику считаются при чтении (сервер — `learning/access.ts`).
import { COURSE_ACCESS_MODES, type Course, type Lesson } from '@dinastia/contracts/courses'
import { Input, toast } from '@dinastia/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { client } from '#/app/orpc.ts'

const SELECT = 'h-9 rounded-md border bg-background px-2 text-sm'

/** Режим доступа курса: уроки «как у курса» следуют ему. */
export function CourseAccess(props: { course: Course; onSaved: (c: Course) => void }) {
	const { t } = useTranslation(['courses', 'errors'])
	const { course } = props
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="course-access">
			<label htmlFor="course-access" className="font-medium text-sm">
				{t('access.course.label')}
			</label>
			<select
				id="course-access"
				className={SELECT}
				value={course.defaultAccessMode}
				onChange={async (e) => {
					try {
						props.onSaved(
							await client.courses.update({
								id: course.id,
								defaultAccessMode: e.target.value as Course['defaultAccessMode'],
							}),
						)
						toast.success(t('access.saved'))
					} catch (err) {
						toast.error(t(errorText(err), { ns: 'errors' }))
					}
				}}
				data-testid="course-access-mode"
			>
				{COURSE_ACCESS_MODES.map((m) => (
					<option key={m} value={m}>
						{t(`access.mode.${m}`)}
					</option>
				))}
			</select>
			<span className="basis-full text-muted-foreground text-xs sm:basis-auto">
				{t(course.status === 'draft' ? 'access.course.hint' : 'access.course.hintLive')}
			</span>
		</div>
	)
}

type LessonModeChoice = Lesson['accessMode']
type DripKind = 'days' | 'date'

/** «Когда урок открывается»: как у курса, сразу, после предыдущего, по расписанию — через N дней или с даты. */
export function LessonAccess(props: { lesson: Lesson; onSaved: (l: Lesson) => void }) {
	const { t } = useTranslation(['courses', 'errors'])
	const { lesson } = props
	const [kind, setKind] = useState<DripKind>(lesson.dripDate ? 'date' : 'days')
	const [days, setDays] = useState(lesson.dripDays !== null ? String(lesson.dripDays) : '1')
	const [date, setDate] = useState(lesson.dripDate ?? '')
	useEffect(() => {
		setKind(lesson.dripDate ? 'date' : 'days')
		if (lesson.dripDays !== null) setDays(String(lesson.dripDays))
		if (lesson.dripDate) setDate(lesson.dripDate)
	}, [lesson.dripDays, lesson.dripDate])

	async function save(input: { accessMode: LessonModeChoice; dripDays?: number | null; dripDate?: string | null }) {
		try {
			props.onSaved(await client.courses.lessons.update({ id: lesson.id, ...input }))
		} catch (err) {
			toast.error(t(errorText(err), { ns: 'errors' }))
		}
	}
	const daysValue = Number(days)
	const daysValid = days.trim() !== '' && Number.isInteger(daysValue) && daysValue >= 0 && daysValue <= 3650
	const saveDrip = (k: DripKind) =>
		k === 'date'
			? date && save({ accessMode: 'drip', dripDate: date, dripDays: null })
			: daysValid && save({ accessMode: 'drip', dripDays: daysValue, dripDate: null })

	return (
		<div className="flex flex-wrap items-center gap-2" data-testid="lesson-access">
			<select
				aria-label={t('access.lesson.label')}
				title={t('access.lesson.hint')}
				className={SELECT}
				value={lesson.accessMode}
				onChange={(e) => {
					const mode = e.target.value as LessonModeChoice
					if (mode !== 'drip') save({ accessMode: mode })
					else if (kind === 'date' && date) save({ accessMode: 'drip', dripDate: date, dripDays: null })
					else save({ accessMode: 'drip', dripDays: daysValid ? daysValue : 1, dripDate: null })
				}}
				data-testid="lesson-access-mode"
			>
				{(['inherit', 'open', 'sequential', 'drip'] as const).map((m) => (
					<option key={m} value={m}>
						{t(`access.lessonMode.${m}`)}
					</option>
				))}
			</select>
			{lesson.accessMode === 'drip' && (
				<>
					<select
						aria-label={t('access.lesson.dripKind')}
						className={SELECT}
						value={kind}
						onChange={(e) => {
							const k = e.target.value as DripKind
							setKind(k)
							saveDrip(k)
						}}
						data-testid="lesson-drip-kind"
					>
						<option value="days">{t('access.drip.days')}</option>
						<option value="date">{t('access.drip.date')}</option>
					</select>
					{kind === 'days' ? (
						<span className="flex items-center gap-2 text-sm">
							<Input
								inputMode="numeric"
								className="h-9 w-20"
								aria-label={t('access.drip.daysLabel')}
								aria-invalid={!daysValid}
								value={days}
								onChange={(e) => setDays(e.target.value)}
								onBlur={() => daysValue !== lesson.dripDays && saveDrip('days')}
								data-testid="lesson-drip-days"
							/>
							{t('access.drip.daysAfter')}
						</span>
					) : (
						<Input
							type="date"
							className="h-9 w-40"
							aria-label={t('access.drip.dateLabel')}
							value={date}
							onChange={(e) => setDate(e.target.value)}
							onBlur={() => date && date !== lesson.dripDate && saveDrip('date')}
							data-testid="lesson-drip-date"
						/>
					)}
				</>
			)}
		</div>
	)
}

type DeadlineKind = 'none' | 'days' | 'date'

/** «Срок сдачи» урока (4.4): нет / через N дней от старта потока или зачисления / до даты (до 23:59 по Москве). */
export function LessonDeadline(props: { lesson: Lesson; onSaved: (l: Lesson) => void }) {
	const { t } = useTranslation(['courses', 'errors'])
	const { lesson } = props
	const current: DeadlineKind = lesson.deadlineDate ? 'date' : lesson.deadlineDays !== null ? 'days' : 'none'
	const [kind, setKind] = useState<DeadlineKind>(current)
	const [days, setDays] = useState(lesson.deadlineDays !== null ? String(lesson.deadlineDays) : '7')
	const [date, setDate] = useState(lesson.deadlineDate ?? '')
	useEffect(() => {
		setKind(lesson.deadlineDate ? 'date' : lesson.deadlineDays !== null ? 'days' : 'none')
		if (lesson.deadlineDays !== null) setDays(String(lesson.deadlineDays))
		if (lesson.deadlineDate) setDate(lesson.deadlineDate)
	}, [lesson.deadlineDays, lesson.deadlineDate])

	async function save(input: { deadlineDays?: number | null; deadlineDate?: string | null }) {
		try {
			props.onSaved(await client.courses.lessons.update({ id: lesson.id, ...input }))
		} catch (err) {
			toast.error(t(errorText(err), { ns: 'errors' }))
		}
	}
	const daysValue = Number(days)
	const daysValid = days.trim() !== '' && Number.isInteger(daysValue) && daysValue >= 0 && daysValue <= 3650

	return (
		<div className="flex flex-wrap items-center gap-2" data-testid="lesson-deadline">
			<select
				aria-label={t('deadline.label')}
				title={t('deadline.hint')}
				className={SELECT}
				value={kind}
				onChange={(e) => {
					const k = e.target.value as DeadlineKind
					setKind(k)
					if (k === 'none') save({ deadlineDays: null, deadlineDate: null })
					else if (k === 'days') save({ deadlineDays: daysValid ? daysValue : 7 })
					else if (date) save({ deadlineDate: date })
				}}
				data-testid="lesson-deadline-kind"
			>
				<option value="none">{t('deadline.none')}</option>
				<option value="days">{t('deadline.days')}</option>
				<option value="date">{t('deadline.date')}</option>
			</select>
			{kind === 'days' && (
				<span className="flex items-center gap-2 text-sm">
					<Input
						inputMode="numeric"
						className="h-9 w-20"
						aria-label={t('deadline.daysLabel')}
						aria-invalid={!daysValid}
						value={days}
						onChange={(e) => setDays(e.target.value)}
						onBlur={() => daysValid && daysValue !== lesson.deadlineDays && save({ deadlineDays: daysValue })}
						data-testid="lesson-deadline-days"
					/>
					{t('deadline.daysAfter')}
				</span>
			)}
			{kind === 'date' && (
				<Input
					type="date"
					className="h-9 w-40"
					aria-label={t('deadline.dateLabel')}
					value={date}
					onChange={(e) => setDate(e.target.value)}
					onBlur={() => date && date !== lesson.deadlineDate && save({ deadlineDate: date })}
					data-testid="lesson-deadline-date"
				/>
			)}
		</div>
	)
}
