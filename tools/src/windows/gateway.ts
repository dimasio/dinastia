// Шлюз пакета для Windows (D-069): то, что в dev делает Vite, а на сервере — веб-сервер перед статикой. Раздаёт сборку веба
// (SPA: неизвестный путь → index.html), ставит ту же политику безопасности контента (apps/web/csp.ts) и проксирует `/api`
// и `/health` в API с исходным Host — по нему сервер определяет учебный центр (D-041). Слушает только loopback.
// Без зависимостей: собирается `pnpm windows:app` в один файл `app/gateway.js`, запускается `node gateway.js`.
import { createReadStream, statSync } from 'node:fs'
import { createServer, type IncomingMessage, request, type ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { contentSecurityPolicy } from '../../../apps/web/csp.ts'

const port = Number(process.env.GATEWAY_PORT ?? 80)
const apiPort = Number(process.env.API_PORT ?? 3000)
const webRoot = normalize(process.env.WEB_ROOT ?? join(import.meta.dirname, 'web'))
const s3Origin = new URL(process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333').origin

const headers = {
	'Content-Security-Policy': contentSecurityPolicy({ s3Origin, dev: false }),
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
}

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.ico': 'image/x-icon',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8',
	'.webmanifest': 'application/manifest+json',
}

function proxy(req: IncomingMessage, res: ServerResponse) {
	const forwarded = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ')
	const upstream = request(
		{
			host: '127.0.0.1',
			port: apiPort,
			method: req.method,
			path: req.url,
			headers: { ...req.headers, 'x-forwarded-for': forwarded, 'x-forwarded-proto': 'http' },
		},
		(up) => {
			res.writeHead(up.statusCode ?? 502, up.headers)
			up.pipe(res)
		},
	)
	upstream.on('error', () => {
		if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
		res.end('API недоступен')
	})
	req.pipe(upstream)
}

function file(path: string): string | null {
	const full = normalize(join(webRoot, decodeURIComponent(path)))
	if (full !== webRoot && !full.startsWith(webRoot + sep)) return null
	try {
		return statSync(full).isFile() ? full : null
	} catch {
		return null
	}
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.writeHead(405, headers).end()
		return
	}
	const path = new URL(req.url ?? '/', 'http://x').pathname
	const found = file(path)
	// файл с расширением, которого нет, — 404; остальное — маршрут SPA
	if (!found && extname(path)) {
		res.writeHead(404, { ...headers, 'content-type': 'text/plain; charset=utf-8' }).end('Не найдено')
		return
	}
	const target = found ?? join(webRoot, 'index.html')
	const immutable = path.startsWith('/assets/')
	res.writeHead(200, {
		...headers,
		'content-type': MIME[extname(target)] ?? 'application/octet-stream',
		'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
	})
	if (req.method === 'HEAD') res.end()
	else createReadStream(target).pipe(res)
}

const handler = (req: IncomingMessage, res: ServerResponse) => {
	const url = req.url ?? '/'
	if (url.startsWith('/api/') || url === '/api' || url.startsWith('/health/')) proxy(req, res)
	else serveStatic(req, res)
}

// браузер пробует *.localhost и по ::1, и по 127.0.0.1 — слушаем оба; IPv6 может быть выключен
createServer(handler).listen(port, '127.0.0.1', () => console.log(`gateway: http://127.0.0.1:${port}`))
createServer(handler)
	.on('error', () => {})
	.listen(port, '::1')
