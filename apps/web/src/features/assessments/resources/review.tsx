// Очередь проверки (скилл admin-resource, карточка 3.5): работы школы — «на проверке» сверху; фильтры «статус» и «курс»,
// поиск по ученику. Ресурс строится на список курсов (подписи фильтра) — поэтому фабрика; в реестре — пустой образец.
import { type ReviewListInput, ReviewRow } from '@dinastia/contracts/assessments'
import { defineResource } from '@dinastia/ui/resource'
import { Link } from '@tanstack/react-router'
import type { z } from 'zod'
import { client } from '#/app/orpc.ts'

type ListInput = z.input<typeof ReviewListInput>

const STATUSES = ['submitted', 'needs_revision', 'accepted', 'rejected', 'graded'] as const
const KINDS = ['assignment', 'quiz'] as const
const tone = (v: unknown) =>
	v === 'accepted'
		? 'default'
		: v === 'submitted'
			? 'secondary'
			: v === 'rejected' || v === 'needs_revision'
				? 'destructive'
				: 'outline'

export function reviewResource(opts: { courses: readonly string[] }) {
	return defineResource({
		key: 'review',
		ns: 'assessments',
		row: ReviewRow,
		list: (input: ListInput) => client.review.list(input),
		perms: { read: 'assessments.review' },
		columns: [
			{
				field: 'studentName',
				// задание — экран работы, тест — экран проверки попытки (3.6)
				render: (row) =>
					row.kind === 'quiz' ? (
						<Link
							to="/admin/review/attempts/$attemptId"
							params={{ attemptId: row.id }}
							className="font-medium hover:underline"
							data-testid="review-open"
						>
							{row.studentName}
						</Link>
					) : (
						<Link
							to="/admin/review/$submissionId"
							params={{ submissionId: row.id }}
							className="font-medium hover:underline"
							data-testid="review-open"
						>
							{row.studentName}
						</Link>
					),
			},
			{ field: 'kind', render: 'badge', tone: () => 'outline' },
			{ field: 'courseTitle' },
			{ field: 'lessonTitle' },
			{ field: 'status', render: 'badge', tone },
			{ field: 'revision', render: 'number' },
			{ field: 'submittedAt', sort: 'submittedAt', render: 'datetime' },
		],
		search: true,
		filters: [
			{ field: 'kind', options: KINDS },
			{ field: 'status', options: STATUSES },
			...(opts.courses.length ? [{ field: 'courseId' as const, options: opts.courses }] : []),
		],
	})
}
