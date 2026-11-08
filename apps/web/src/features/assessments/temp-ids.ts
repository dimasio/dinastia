/**
 * Предпросмотр несохранённого вопроса: у элементов (варианты, элементы порядка, пары) id выдаёт сервер при сохранении,
 * а ответ ученика ссылается на id — до сохранения выдаём временные.
 */
export function withTempIds<T extends Record<string, unknown>>(data: T): T {
	const out: Record<string, unknown> = { ...data }
	for (const [key, value] of Object.entries(out))
		if (Array.isArray(value))
			out[key] = value.map((item) =>
				item && typeof item === 'object' && !('id' in item && item.id) ? { ...item, id: crypto.randomUUID() } : item,
			)
	return out as T
}
