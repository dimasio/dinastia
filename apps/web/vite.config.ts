import { existsSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

if (existsSync('../../.env')) process.loadEnvFile('../../.env')
const appDomain = process.env.APP_DOMAIN ?? 'dinastia.localhost'

export default defineConfig({
	plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
	define: { 'import.meta.env.VITE_APP_DOMAIN': JSON.stringify(appDomain) },
	server: {
		port: Number(process.env.WEB_PORT ?? 5173),
		host: true,
		// Корень и поддомены школ (D-041); остальные хосты Vite отклоняет.
		allowedHosts: [appDomain, `.${appDomain}`],
		// API — тот же origin: Host сохраняется (changeOrigin: false), по нему сервер определяет школу.
		proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, changeOrigin: false } },
	},
})
