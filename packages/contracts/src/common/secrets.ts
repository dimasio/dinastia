// Пути к полям-секретам реестров (блоки, вопросы): `items.*.isCorrect` — звёздочка значит «каждый элемент массива».
// По ним defineBlock/defineQuestion проверяют, что toPublic убирает секреты (скиллы lesson-blocks, question-types).

/** Значения по пути `a.*.b`. */
export function valuesAt(value: unknown, path: string): unknown[] {
	let current: unknown[] = [value]
	for (const part of path.split('.')) {
		current = current.flatMap((v) => {
			if (part === '*') return Array.isArray(v) ? v : []
			return v !== null && typeof v === 'object' && part in v ? [(v as Record<string, unknown>)[part]] : []
		})
	}
	return current
}

/** Есть ли поле по пути хотя бы у одного элемента. */
export function hasPath(value: unknown, path: string): boolean {
	const parts = path.split('.')
	const last = parts.pop() as string
	const parents = parts.length ? valuesAt(value, parts.join('.')) : [value]
	return parents.some((p) => p !== null && typeof p === 'object' && last in p)
}
