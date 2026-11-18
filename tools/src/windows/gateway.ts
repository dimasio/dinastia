// Шлюз пакета для Windows (D-069): то, что в dev делает Vite, а на сервере — веб-сервер перед статикой. Раздаёт сборку веба
// (SPA: неизвестный путь → index.html), ставит ту же политику безопасности контента (apps/web/csp.ts) и проксирует `/api`
// и `/health` в API с исходным Host — по нему сервер определяет учебный центр (D-041). Слушает только loopback; в сетевом
// режиме лаунчера — все интерфейсы (`GATEWAY_HOST=0.0.0.0`) и ещё порт хранилища (`S3_PROXY_PORT` → SeaweedFS на loopback):
// подписанные ссылки S3 открываются с других устройств, а сам SeaweedFS (мастер, filer) в сеть не выходит.
// Корневой адрес лаунчер меняет без пересборки веба (сетевой режим — `*.sslip.io`): шлюз вписывает `APP_DOMAIN` в `index.html`
// меткой `<meta name="app-domain">`, веб берёт его оттуда (apps/web/src/app/host.ts).
// Без зависимостей: собирается `pnpm windows:app` в один файл `app/gateway.js`, запускается `node gateway.js`.
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, request, type ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { contentSecurityPolicy } from '../../../apps/web/csp.ts'

const port = Number(process.env.GATEWAY_PORT ?? 80)
const host = process.env.GATEWAY_HOST ?? '127.0.0.1'
const s3ProxyPort = Number(process.env.S3_PROXY_PORT ?? 0)
const s3UpstreamPort = Number(process.env.S3_UPSTREAM_PORT ?? 0)
const apiPort = Number(process.env.API_PORT ?? 3000)
const webRoot = normalize(process.env.WEB_ROOT ?? join(import.meta.dirname, 'web'))
const s3Origin = new URL(process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333').origin
const appDomain = process.env.APP_DOMAIN ?? ''
const indexHtml = join(webRoot, 'index.html')

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

function proxy(req: IncomingMessage, res: ServerResponse, upstreamPort = apiPort) {
	const forwarded = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ')
	// S3: заголовки — как есть (Host входит в подпись ссылки)
	const headers =
		upstreamPort === apiPort
			? { ...req.headers, 'x-forwarded-for': forwarded, 'x-forwarded-proto': 'http' }
			: req.headers
	const upstream = request(
		{ host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers },
		(up) => {
			res.writeHead(up.statusCode ?? 502, up.headers)
			up.pipe(res)
		},
	)
	upstream.on('error', () => {
		if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
		res.end('Служба недоступна')
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
	const target = found ?? indexHtml
	const immutable = path.startsWith('/assets/')
	res.writeHead(200, {
		...headers,
		'content-type': MIME[extname(target)] ?? 'application/octet-stream',
		'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
	})
	if (req.method === 'HEAD') res.end()
	else if (target === indexHtml) res.end(withAppDomain(readFileSync(indexHtml, 'utf8')))
	else createReadStream(target).pipe(res)
}

function withAppDomain(html: string) {
	if (!appDomain) return html
	const content = appDomain.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`)
	return html.replace('</head>', `<meta name="app-domain" content="${content}" /></head>`)
}

const handler = (req: IncomingMessage, res: ServerResponse) => {
	const url = req.url ?? '/'
	if (url.startsWith('/api/') || url === '/api' || url.startsWith('/health/')) proxy(req, res)
	else serveStatic(req, res)
}

createServer(handler).listen(port, host, () => console.log(`gateway: http://${host}:${port}`))
// браузер пробует *.localhost и по ::1, и по 127.0.0.1 — слушаем и ::1; IPv6 может быть выключен
createServer(handler)
	.on('error', () => {})
	.listen(port, '::1')
if (s3ProxyPort && s3UpstreamPort) {
	createServer((req, res) => proxy(req, res, s3UpstreamPort)).listen(s3ProxyPort, host, () =>
		console.log(`gateway: S3 http://${host}:${s3ProxyPort} → 127.0.0.1:${s3UpstreamPort}`),
	)
}
