import { describe, expect, it } from 'vitest'
import { resolveHost } from './host.ts'

describe('resolveHost', () => {
	const d = 'dinastia.localhost'
	it.each([
		['dinastia.localhost:5173', { kind: 'root' }],
		['demo.dinastia.localhost:5173', { kind: 'school', slug: 'demo' }],
		['DEMO.Dinastia.localhost', { kind: 'school', slug: 'demo' }],
		['a.b.dinastia.localhost', { kind: 'unknown' }],
		['evil-dinastia.localhost', { kind: 'unknown' }],
		['example.com', { kind: 'unknown' }],
		[undefined, { kind: 'unknown' }],
	])('%s', (host, expected) => {
		expect(resolveHost(host, d)).toEqual(expected)
	})
})
