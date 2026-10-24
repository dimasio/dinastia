// Тема (светлая/тёмная/как в системе) — без next-themes. Класс `dark` на <html>, выбор — в localStorage.
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'dinastia.theme'

const ThemeContext = createContext<{ theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void }>({
	theme: 'system',
	resolved: 'light',
	setTheme: () => {},
})

function readStored(): Theme {
	try {
		const v = localStorage.getItem(KEY)
		return v === 'light' || v === 'dark' ? v : 'system'
	} catch {
		return 'system'
	}
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(readStored)
	const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

	useEffect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)')
		const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
		mq.addEventListener('change', on)
		return () => mq.removeEventListener('change', on)
	}, [])

	const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
	useEffect(() => {
		document.documentElement.classList.toggle('dark', resolved === 'dark')
	}, [resolved])

	const setTheme = (t: Theme) => {
		setThemeState(t)
		try {
			localStorage.setItem(KEY, t)
		} catch {}
	}
	return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
