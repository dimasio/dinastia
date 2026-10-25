import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Тесты ходят в отдельную базу dinastia_test (скилл testing): подменяем URL до загрузки config.ts.
if (existsSync('../../.env')) process.loadEnvFile('../../.env')

export default defineConfig({
	test: {
		globalSetup: ['./src/test/global-setup.ts'],
		setupFiles: ['./src/test/setup.ts'],
		env: {
			NODE_ENV: 'test',
			DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
			DATABASE_URL_OWNER: process.env.DATABASE_URL_TEST_OWNER ?? '',
			MAIL_TRANSPORT: 'memory',
			TRUST_PROXY_HOPS: '1', // тесты различают клиентов через X-Forwarded-For
		},
	},
})
