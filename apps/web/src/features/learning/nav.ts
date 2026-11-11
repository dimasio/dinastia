import { GraduationCap } from 'lucide-react'
import { defineNav } from '#/app/nav.ts'

export const nav = defineNav([
	{
		area: 'admin',
		to: '/admin/students',
		label: 'learning:nav.students',
		icon: GraduationCap,
		perm: 'schools.members.read',
		group: 'people',
		order: 10,
	},
])
