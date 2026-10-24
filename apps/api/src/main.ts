import { serve } from '@hono/node-server'
import { createApp } from './app.ts'

const port = Number(process.env.API_PORT ?? 3000)

serve({ fetch: createApp().fetch, port }, (info) => {
	console.log(`api: http://localhost:${info.port}`)
})
