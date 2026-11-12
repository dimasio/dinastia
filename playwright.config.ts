import { defineConfig, devices } from '@playwright/test'
import { E2E_API_PORT, E2E_DOMAIN, E2E_WEB_PORT, e2eEnv } from './tests/e2e/env.ts'

// e2e (скилл testing): свой контур — база dinastia_e2e, Mailpit :8026, API :3100, веб dinastia.localhost:5174
// (tests/e2e/env.ts); перед прогоном база пересоздаётся и засевается (`e2e:prepare`). Локально на macOS 13 Playwright
// не ставит свой Chromium — используем установленный Google Chrome (channel: 'chrome'); в CI (Linux) — штатный.
const useSystemChrome = process.platform === 'darwin'

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: false,
	// два воркера: при четырёх на наборе из ~50 сценариев списки и переходы не успевают за ожиданиями (плавающие тесты)
	workers: 2,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: `http://${E2E_DOMAIN}:${E2E_WEB_PORT}`,
		locale: 'ru-RU',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		...(useSystemChrome ? { channel: 'chrome' } : {}),
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], ...(useSystemChrome ? { channel: 'chrome' } : {}) } },
	],
	// Без turbo: он запускает задачи в отдельных группах процессов, и после прогона api/vite оставались висеть.
	// Серверы не переиспользуются: каждый прогон — с чистой базы.
	webServer: [
		{
			// база с нуля и данные сценариев, затем API + воркер задач (письма уходят из очереди)
			command: 'pnpm --filter @dinastia/api e2e:prepare && pnpm --filter @dinastia/api start:all',
			env: e2eEnv,
			url: `http://localhost:${E2E_API_PORT}/health/live`,
			reuseExistingServer: false,
			timeout: 180_000,
		},
		{
			command: 'pnpm --filter @dinastia/web exec vite --strictPort',
			env: e2eEnv,
			// 403 от Vite на чужой Host Playwright считает «сервер жив»
			url: `http://localhost:${E2E_WEB_PORT}`,
			reuseExistingServer: false,
			timeout: 60_000,
		},
	],
})
