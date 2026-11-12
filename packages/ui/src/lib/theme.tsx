// Тема (светлая/тёмная/как в системе) — без next-themes. Класс `dark` на <html>, выбор — в localStorage; без выбора — тема
// школы по умолчанию (оформление, 5.9).
import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'dinastia.theme'

const ThemeContext = createContext<{ theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void }>({
	theme: 'system',
	resolved: 'light',
	setTheme: () => {},
})

const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark' || v === 'system'

/** Тема школы по умолчанию (5.9): `--default-scheme` из /api/branding.css, подключённого в <head> до скриптов. */
function schoolDefault(): Theme {
	const v = getComputedStyle(document.documentElement).getPropertyValue('--default-scheme').trim()
	return isTheme(v) ? v : 'system'
}

/** Свой выбор посетителя; не выбирал — тема школы по умолчанию. */
function readStored(): Theme {
	try {
		const v = localStorage.getItem(KEY)
		if (isTheme(v)) return v
	} catch {}
	return schoolDefault()
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
	// до отрисовки: тёмная тема по умолчанию не мигает светлой
	useLayoutEffect(() => {
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
