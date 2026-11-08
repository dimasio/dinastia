import { ClipboardCheck } from 'lucide-react'
import { defineNav } from '#/app/nav.ts'

export const nav = defineNav([
	{
		area: 'admin',
		to: '/admin/review',
		label: 'assessments:nav.review',
		icon: ClipboardCheck,
		perm: 'assessments.review',
		group: 'learning',
		order: 10,
	},
])
