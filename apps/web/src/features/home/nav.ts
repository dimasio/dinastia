import { BookOpen, House } from 'lucide-react'
import { defineNav } from '#/app/nav.ts'

export const nav = defineNav([
	{ area: 'admin', to: '/admin', label: 'nav:admin.home', icon: House, group: 'main', order: 0, exact: true },
	{ area: 'learn', to: '/learn', label: 'nav:learn.home', icon: BookOpen, group: 'main', order: 0, exact: true },
])
