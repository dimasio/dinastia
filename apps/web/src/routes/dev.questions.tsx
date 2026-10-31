// Песочница вопросов (пункт 1.4): редактор в «банке» (QuestionEditorHost) → попытка по публичным данным
// (toPublic, QuestionViewerHost) → проверка (grade) и разбор (review). Проверка здесь — в браузере ради демо;
// в продукте только сервер (kernel/questions → gradeAnswer). Только в режиме разработки.
import { questionDef } from '@dinastia/questions'
import { QuestionEditorHost, QuestionViewerHost } from '@dinastia/questions/client'
import { Badge, Button, Card, CardContent, PageHeader } from '@dinastia/ui'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/dev/questions')({
	beforeLoad: () => {
		if (!import.meta.env.DEV) throw notFound()
	},
	component: Sandbox,
})

const TYPE = 'single_choice'
const def = questionDef(TYPE)
/** У вариантов в банке есть id (их выдаёт сервер при сохранении) — в песочнице выдаём сами. */
const withIds = (data: unknown) => {
	const d = data as { options?: { id?: string }[] }
	return { ...d, options: d.options?.map((o) => ({ ...o, id: o.id ?? crypto.randomUUID() })) }
}

function Sandbox() {
	const { t } = useTranslation()
	const { t: tq } = useTranslation('questions')
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
				<Card>
					<CardContent>
						<QuestionEditorHost
							type={TYPE}
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
								type={TYPE}
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
