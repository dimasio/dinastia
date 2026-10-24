// Типизированный клиент API (скилл api-endpoints): тот же контракт, что реализует сервер. Типы руками не пишутся.
import type { Contract } from '@dinastia/contracts'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

const link = new RPCLink({
	// Тот же origin, что у страницы (школа — по поддомену); cookie сессии уходит сама.
	url: () => `${window.location.origin}/api/rpc`,
	fetch: (request, init) => fetch(request, { ...init, credentials: 'include' }),
})

export const client: ContractRouterClient<Contract> = createORPCClient(link)

/** `orpc.<модуль>.<процедура>.queryOptions()/mutationOptions()/key()` для TanStack Query. */
export const orpc = createTanstackQueryUtils(client)
