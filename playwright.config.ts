import { defineConfig, devices } from '@playwright/test'

// e2e (скилл testing): против `pnpm dev` на dinastia.localhost:5173 и Mailpit. Локально на macOS 13 Playwright
// не ставит свой Chromium — используем установленный Google Chrome (channel: 'chrome'); в CI (Linux) — штатный.
const useSystemChrome = process.platform === 'darwin'

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://dinastia.localhost:5173',
		locale: 'ru-RU',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		...(useSystemChrome ? { channel: 'chrome' } : {}),
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], ...(useSystemChrome ? { channel: 'chrome' } : {}) } },
	],
	// Без turbo: он запускает задачи в отдельных группах процессов, и после прогона api/vite оставались висеть.
	webServer: [
		{
			command: 'pnpm --filter @dinastia/api start',
			// все входы набора — с 127.0.0.1; лимит по IP (5/мин) иначе роняет сценарии. В production не меняется.
			env: { AUTH_SIGN_IN_LIMIT: '1000' },
			url: 'http://localhost:3000/health/live',
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
		},
		{
			command: 'pnpm --filter @dinastia/web exec vite --strictPort',
			// 403 от Vite на чужой Host Playwright считает «сервер жив»
			url: 'http://localhost:5173',
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
		},
	],
})
