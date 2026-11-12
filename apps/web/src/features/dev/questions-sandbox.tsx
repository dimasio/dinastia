// Песочница вопросов (пункт 1.4): редактор в «банке» (QuestionEditorHost) → попытка по публичным данным
// (toPublic, QuestionViewerHost) → проверка (grade) и разбор (review). Проверка здесь — в браузере ради демо;
// в продукте только сервер (kernel/questions → gradeAnswer). Только в режиме разработки.
// Содержимое маршрута /dev/questions отдельным модулем: в production-сборке модули features/dev/ заменяются заглушкой (5.8).
import { questionDef, questionTypes } from '@dinastia/questions'
import { QuestionEditorHost, QuestionViewerHost } from '@dinastia/questions/client'
import { Badge, Button, Card, CardContent, PageHeader } from '@dinastia/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { withTempIds } from '#/features/assessments/temp-ids.ts'

const withIds = (data: unknown) => withTempIds(data as Record<string, unknown>)

export function Sandbox() {
	const { t } = useTranslation()
	const { t: tq } = useTranslation('questions')
	const [type, setType] = useState('single_choice')
	const def = questionDef(type)
	const [saved, setSaved] = useState<unknown>(null)
	const [attempt, setAttempt] = useState<unknown>(null)
	const [response, setResponse] = useState<unknown>(null)
	const [graded, setGraded] = useState<{ score: number; max: number; isCorrect: boolean } | null>(null)
	if (!def) return null

	return (
		<main className="mx-auto grid max-w-3xl gap-6 p-4 sm:p-8">
			<PageHeader title={t('devQuestions.title')} description={t('devQuestions.description')} />
			<section className="grid gap-3" aria-label={t('devQuestions.bank')}>
				<h2 className="font-semibold">{t('devQuestions.bank')}</h2>
				<select
					value={type}
					onChange={(e) => {
						setType(e.target.value)
						setSaved(null)
						setAttempt(null)
						setResponse(null)
						setGraded(null)
					}}
					className="h-10 w-fit rounded-md border bg-background px-2 text-sm"
					aria-label={t('devQuestions.type')}
					data-testid="sandbox-type"
				>
					{Object.keys(questionTypes).map((k) => (
						<option key={k} value={k}>
							{tq(`${k}.title` as 'single_choice.title')}
						</option>
					))}
				</select>
				<Card>
					<CardContent>
						<QuestionEditorHost
							key={type}
							type={type}
							value={def.defaults()}
							delayMs={100}
							testId="bank"
							onChange={(data) => setSaved(withIds(data))}
						/>
					</CardContent>
				</Card>
				<Button
					type="button"
					className="justify-self-start"
					disabled={!saved}
					data-testid="sandbox-start"
					onClick={() => {
						setAttempt(saved)
						setResponse(null)
						setGraded(null)
					}}
				>
					{t('devQuestions.start')}
				</Button>
			</section>
			{attempt !== null && (
				<section className="grid gap-3" aria-label={t('devQuestions.attempt')}>
					<h2 className="font-semibold">{t('devQuestions.attempt')}</h2>
					<Card>
						<CardContent className="grid gap-4">
							<QuestionViewerHost
								type={type}
								data={def.toPublic(attempt)}
								response={response}
								testId="attempt"
								{...(graded ? { review: def.review(attempt) } : { onChange: setResponse })}
							/>
							<div className="flex items-center gap-3">
								{graded ? (
									<>
										<Badge variant={graded.isCorrect ? 'default' : 'destructive'} data-testid="sandbox-verdict">
											{graded.isCorrect ? tq('host.correct') : tq('host.incorrect')}
										</Badge>
										<span className="text-sm" data-testid="sandbox-score">
											{tq('host.score', { score: graded.score, max: graded.max })}
										</span>
										<Button
											type="button"
											variant="outline"
											onClick={() => {
												setGraded(null)
												setResponse(null)
											}}
										>
											{t('devQuestions.again')}
										</Button>
									</>
								) : (
									<Button
										type="button"
										disabled={response === null}
										data-testid="sandbox-check"
										onClick={() => setGraded(def.grade?.(attempt, def.responseSchema.parse(response)) ?? null)}
									>
										{t('devQuestions.check')}
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				</section>
			)}
		</main>
	)
}
