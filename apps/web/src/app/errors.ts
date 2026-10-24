import { errorKey } from '@dinastia/i18n'
import { ORPCError } from '@orpc/client'

/** Код ошибки для текста: oRPC — data.code; better-auth — его code; сеть — NETWORK. */
export function errorCode(error: unknown): string {
	if (error instanceof ORPCError) {
		const data = error.data as { code?: string; issues?: { message?: string }[] } | undefined
		const issue = data?.issues?.map((i) => i.message).find((m) => m && /^[A-Z_]+$/.test(m))
		return issue ?? data?.code ?? error.code
	}
	if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
	if (error instanceof TypeError) return 'NETWORK'
	return 'UNKNOWN'
}

export const errorText = (error: unknown) => errorKey(errorCode(error))

export function httpStatus(error: unknown): number | undefined {
	return error instanceof ORPCError ? error.status : undefined
}
