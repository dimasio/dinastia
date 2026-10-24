// Ожидаемые бизнес-ошибки (скилл data-access): код UPPER_SNAKE + класс HTTP. Текст для человека — errors:<code> в i18n.
export type ErrorKind = 'invalid' | 'unauthorized' | 'forbidden' | 'notFound' | 'conflict' | 'tooMany'

const status: Record<ErrorKind, number> = {
	invalid: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404,
	conflict: 409,
	tooMany: 429,
}

export class AppError extends Error {
	readonly status: number
	constructor(
		readonly kind: ErrorKind,
		readonly code: string,
		readonly data?: Record<string, unknown>,
	) {
		super(code)
		this.name = 'AppError'
		this.status = status[kind]
	}
}

const thrower =
	(kind: ErrorKind) =>
	(code: string, data?: Record<string, unknown>): never => {
		throw new AppError(kind, code, data)
	}

export const fail = {
	invalid: thrower('invalid'),
	unauthorized: thrower('unauthorized'),
	forbidden: thrower('forbidden'),
	notFound: thrower('notFound'),
	conflict: thrower('conflict'),
	tooMany: thrower('tooMany'),
}
