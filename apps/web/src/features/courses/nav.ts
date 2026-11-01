import { BookOpen } from 'lucide-react'
import { defineNav } from '#/app/nav.ts'

export const nav = defineNav([
	{
		area: 'admin',
		to: '/admin/courses',
		label: 'courses:nav.title',
		icon: BookOpen,
		perm: 'courses.read',
		group: 'content',
		order: 10,
	},
])
