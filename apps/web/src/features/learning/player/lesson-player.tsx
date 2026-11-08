// Плеер урока ученика (карточка 2.6): блоки через BlockViewerHost, боковое оглавление (на телефоне — Sheet),
// «Назад / Далее», «Завершить урок» при правиле manual. Открытие урока фиксируется на сервере (learn.lessons.open).

import { BlockViewerHost } from '@dinastia/blocks/client'
import type { PlayerLesson } from '@dinastia/contracts/learning'
import { Button, EmptyState, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton } from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, CircleCheck, List, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorCode, errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { LessonList, useLockedText } from '../lesson-list.tsx'
import { QuizPanel } from '../quiz/quiz-panel.tsx'

export function LessonPlayer({ courseId, lessonId }: { courseId: string; lessonId: string }) {
	const { t } = useTranslation(['learning', 'errors'])
	const qc = useQueryClient()
	const [contentsOpen, setContentsOpen] = useState(false)
	const lockedText = useLockedText()
	const lessonQuery = orpc.learn.lessons.get.queryOptions({ input: { lessonId } })
	const outlineQuery = orpc.learn.courses.get.queryOptions({ input: { courseId } })
	const lesson = useQuery(lessonQuery)
	const outline = useQuery(outlineQuery)

	const refresh = () =>
		Promise.all([
			qc.invalidateQueries({ queryKey: lessonQuery.queryKey }),
			qc.invalidateQueries({ queryKey: outlineQuery.queryKey }),
			qc.invalidateQueries({ queryKey: orpc.learn.courses.list.queryOptions().queryKey }),
		])
	const open = useMutation(orpc.learn.lessons.open.mutationOptions({ onSuccess: refresh }))
	const complete = useMutation(orpc.learn.lessons.complete.mutationOptions({ onSuccess: refresh }))

	// открытие фиксируем один раз на урок, когда он загрузился (закрытый не загрузится — 403)
	const loaded = lesson.isSuccess
	useEffect(() => {
		if (loaded) open.mutate({ lessonId })
	}, [loaded, lessonId])

	if (lesson.isPending) return <Skeleton className="h-64 w-full" />
	if (lesson.error) {
		const code = errorCode(lesson.error)
		return (
			<>
				<BackToCourse courseId={courseId} />
				<EmptyState
					icon={code === 'LESSON_LOCKED' ? Lock : ArrowLeft}
					title={code === 'LESSON_LOCKED' ? t('player.lockedTitle') : t(errorText(lesson.error), { ns: 'errors' })}
					description={code === 'LESSON_LOCKED' ? (lockedText(lockedBy(lesson.error)) ?? undefined) : undefined}
				/>
			</>
		)
	}
	const page: PlayerLesson = lesson.data
	const done = page.lesson.status === 'completed'
	const nextReady = page.next && !page.next.locked ? page.next : null
	const contents = outline.data && !outline.data.course.expired ? outline.data : null

	return (
		<div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
			{contents && (
				<aside className="hidden lg:block" aria-label={t('course.contents')}>
					<LessonList outline={contents} currentId={lessonId} />
				</aside>
			)}
			<div className="min-w-0">
				<div className="mb-4 flex items-center justify-between gap-2">
					<BackToCourse courseId={courseId} />
					<Button
						variant="outline"
						size="sm"
						className="lg:hidden"
						onClick={() => setContentsOpen(true)}
						data-testid="player-contents"
					>
						<List />
						{t('course.contents')}
					</Button>
				</div>
				<h1 className="mb-1 font-semibold text-xl tracking-tight" data-testid="player-title">
					{page.lesson.title}
				</h1>
				<p className="mb-6 text-muted-foreground text-sm">{page.lesson.courseTitle}</p>

				{page.blocks.length === 0 ? (
					<EmptyState icon={List} title={t('player.emptyTitle')} />
				) : (
					<article className="grid max-w-3xl gap-4" data-testid="player-lesson">
						{page.blocks.map((block) =>
							// тест проходится через API попыток — панель теста вместо обычного просмотра (карточка 3.3)
							block.type === 'quiz' ? (
								<QuizPanel key={block.id} lessonId={lessonId} blockKey={block.blockKey} />
							) : (
								<BlockViewerHost
									key={block.id}
									type={block.type}
									data={block.data}
									files={block.files}
									testId="player-block"
								/>
							),
						)}
					</article>
				)}

				<footer className="mt-8 flex flex-wrap items-center gap-3 border-t pt-4">
					{page.prev && !page.prev.locked && (
						<Button variant="outline" asChild>
							<Link
								to="/learn/courses/$courseId/lessons/$lessonId"
								params={{ courseId, lessonId: page.prev.id }}
								data-testid="player-prev"
							>
								<ArrowLeft />
								{t('player.prev')}
							</Link>
						</Button>
					)}
					{page.lesson.completionRule === 'manual' && !done && (
						<Button
							onClick={() => complete.mutate({ lessonId })}
							disabled={complete.isPending}
							data-testid="player-complete"
						>
							{t('player.complete')}
						</Button>
					)}
					{done && (
						<span className="inline-flex items-center gap-1.5 text-primary text-sm" data-testid="player-done">
							<CircleCheck className="size-4" aria-hidden />
							{t('player.completed')}
						</span>
					)}
					{nextReady && (
						<Button variant={done ? 'default' : 'outline'} className="sm:ml-auto" asChild>
							<Link
								to="/learn/courses/$courseId/lessons/$lessonId"
								params={{ courseId, lessonId: nextReady.id }}
								data-testid="player-next"
							>
								{done ? t('player.nextLesson') : t('player.next')}
								<ArrowRight />
							</Link>
						</Button>
					)}
				</footer>
			</div>

			<Sheet open={contentsOpen} onOpenChange={setContentsOpen}>
				<SheetContent side="left" className="w-80 overflow-y-auto">
					<SheetHeader>
						<SheetTitle>{t('course.contents')}</SheetTitle>
					</SheetHeader>
					<div className="px-4 pb-4">
						{contents && (
							<LessonList outline={contents} currentId={lessonId} onNavigate={() => setContentsOpen(false)} />
						)}
					</div>
				</SheetContent>
			</Sheet>
		</div>
	)
}

function BackToCourse({ courseId }: { courseId: string }) {
	const { t } = useTranslation('learning')
	return (
		<Link
			to="/learn/courses/$courseId"
			params={{ courseId }}
			className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:underline"
			data-testid="player-back"
		>
			<ArrowLeft className="size-4" aria-hidden />
			{t('player.toCourse')}
		</Link>
	)
}

/** `lockedBy` из ошибки LESSON_LOCKED (data сервера). */
function lockedBy(error: unknown) {
	const data = (error as { data?: { lockedBy?: import('@dinastia/contracts/learning').LockedBy } })?.data
	return data?.lockedBy ?? null
}
