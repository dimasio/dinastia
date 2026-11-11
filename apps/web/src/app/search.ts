// Параметры адреса маршрутов (5.2): простые проверки вместо схем zod — маршруты разбирают адрес при старте приложения, и zod не
// должен попадать в начальную загрузку. Битое значение отбрасывается, а не ломает экран.

/** Строка не длиннее `max` (и по шаблону, если задан); иначе — нет значения. */
export function searchString(value: unknown, max: number, pattern?: RegExp): string | undefined {
	if (typeof value !== 'string' || value.length > max) return undefined
	return !pattern || pattern.test(value) ? value : undefined
}
