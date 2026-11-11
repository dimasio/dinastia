import { existsSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { contentSecurityPolicy } from './csp.ts'

if (existsSync('../../.env')) process.loadEnvFile('../../.env')
const appDomain = process.env.APP_DOMAIN ?? 'dinastia.localhost'
const s3Origin = new URL(process.env.S3_ENDPOINT ?? 'http://localhost:8333').origin
const sentryDsn = process.env.SENTRY_DSN_WEB ?? ''

export default defineConfig({
	plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
	define: {
		'import.meta.env.VITE_APP_DOMAIN': JSON.stringify(appDomain),
		// сбор ошибок (5.4): адрес GlitchTip и версия — при сборке
		'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(sentryDsn || undefined),
		'import.meta.env.VITE_APP_RELEASE': JSON.stringify(process.env.APP_RELEASE ?? 'dev'),
	},
	// манифест — для проверки бюджета размера (`pnpm bundle:budget`, 5.2)
	build: { manifest: true },
	server: {
		port: Number(process.env.WEB_PORT ?? 5173),
		host: true,
		// Корень и поддомены школ (D-041); остальные хосты Vite отклоняет.
		allowedHosts: [appDomain, `.${appDomain}`],
		// политика безопасности контента — как в production (5.1): e2e идут под ней
		headers: {
			'Content-Security-Policy': contentSecurityPolicy({
				s3Origin,
				dev: true,
				...(sentryDsn ? { reportOrigin: new URL(sentryDsn).origin } : {}),
			}),
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'strict-origin-when-cross-origin',
		},
		// API — тот же origin: Host сохраняется (changeOrigin: false), по нему сервер определяет школу.
		proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, changeOrigin: false, xfwd: true } },
	},
})
