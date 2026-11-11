import { Settings, Users } from 'lucide-react'
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
	{
		area: 'admin',
		to: '/admin/settings',
		label: 'schools:nav.settings',
		icon: Settings,
		perm: 'schools.settings.manage',
		group: 'settings',
		order: 10,
	},
])
