// Клиент better-auth (вход, magic link, выход) — тот же origin, cookie сессии общая для корня и школ (D-041).
import { magicLinkClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
	baseURL: window.location.origin,
	basePath: '/api/auth',
	plugins: [magicLinkClient()],
})
