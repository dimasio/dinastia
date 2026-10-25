import { Users } from 'lucide-react'
import { defineNav } from '#/app/nav.ts'

export const nav = defineNav([
	{
		area: 'admin',
		to: '/admin/staff',
		label: 'schools:nav.staff',
		icon: Users,
		perm: 'schools.members.read',
		group: 'people',
		order: 20,
	},
])
