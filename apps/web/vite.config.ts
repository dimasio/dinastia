import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const appDomain = process.env.APP_DOMAIN ?? 'dinastia.localhost'

export default defineConfig({
	plugins: [react()],
	server: {
		port: Number(process.env.WEB_PORT ?? 5173),
		host: true,
		// Корень и поддомены школ (D-041); остальные хосты Vite отклоняет.
		allowedHosts: [appDomain, `.${appDomain}`],
		// API — тот же origin: Host сохраняется (changeOrigin: false), по нему сервер определяет школу.
		proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, changeOrigin: false } },
	},
})
