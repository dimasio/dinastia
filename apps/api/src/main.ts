import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { config } from './kernel/config.ts'
import { initErrorReporting } from './kernel/error-report.ts'
import { serveMetrics } from './kernel/metrics.ts'
import { registerCoreCollectors } from './kernel/metrics-collectors.ts'

const port = Number(process.env.API_PORT ?? 3000)

// наблюдаемость (5.4): ошибки — в GlitchTip при SENTRY_DSN, метрики — на внутреннем порту при METRICS_PORT
initErrorReporting('api')
if (config.METRICS_PORT) {
	registerCoreCollectors()
	serveMetrics(config.METRICS_PORT)
}

serve({ fetch: createApp().fetch, port }, (info) => {
	console.log(`api: http://localhost:${info.port}`)
})
