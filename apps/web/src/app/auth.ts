// Клиент better-auth (вход, magic link, выход) — тот же origin, cookie сессии общая для корня и школ (D-041).
import { magicLinkClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
	baseURL: window.location.origin,
	basePath: '/api/auth',
	// второй фактор — у операторов консоли (5.6): после пароля форма входа просит код из приложения
	plugins: [magicLinkClient(), twoFactorClient()],
})
