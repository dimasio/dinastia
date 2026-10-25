import { resources as i18n } from '@dinastia/i18n'
import { resourceKeys } from '@dinastia/ui/resource'
import { describe, expect, it } from 'vitest'
import { resources } from './resources.ts'

/** Строка по ключу `<ns>:<путь.через.точки>`. */
function lookup(key: string): unknown {
	const [ns, path = ''] = key.split(':')
	return path
		.split('.')
		.reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], i18n.ru[ns as 'common'])
}

describe.each(resources.map((r) => [`${r.ns}:${r.key}`, r] as const))('ресурс %s', (_, resource) => {
	it('все строки экрана есть в i18n', () => {
		const missing = resourceKeys(resource)
			.map((k) => `${resource.ns}:${resource.key}.${k}`)
			.filter((k) => typeof lookup(k) !== 'string')
		expect(missing).toEqual([])
	})

	it('подписи значений из общих словарей (labels) существуют', () => {
		const missing = (resource.filters ?? []).flatMap((f) =>
			f.labels ? f.options.map((o) => `${f.labels}.${o}`).filter((k) => typeof lookup(k) !== 'string') : [],
		)
		expect(missing).toEqual([])
	})
})
