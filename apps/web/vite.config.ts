import { existsSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { contentSecurityPolicy } from './csp.ts'

if (existsSync('../../.env')) process.loadEnvFile('../../.env')
const appDomain = process.env.APP_DOMAIN ?? 'dinastia.localhost'
const s3Origin = new URL(process.env.S3_ENDPOINT ?? 'http://localhost:8333').origin

export default defineConfig({
	plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
	define: { 'import.meta.env.VITE_APP_DOMAIN': JSON.stringify(appDomain) },
	server: {
		port: Number(process.env.WEB_PORT ?? 5173),
		host: true,
		// Корень и поддомены школ (D-041); остальные хосты Vite отклоняет.
		allowedHosts: [appDomain, `.${appDomain}`],
		// политика безопасности контента — как в production (5.1): e2e идут под ней
		headers: {
			'Content-Security-Policy': contentSecurityPolicy({ s3Origin, dev: true }),
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'strict-origin-when-cross-origin',
		},
		// API — тот же origin: Host сохраняется (changeOrigin: false), по нему сервер определяет школу.
		proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, changeOrigin: false, xfwd: true } },
	},
})
