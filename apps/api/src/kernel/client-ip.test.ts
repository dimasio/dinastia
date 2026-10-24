import { describe, expect, it } from 'vitest'
import { resolveClientIp } from './client-ip.ts'

describe('IP клиента', () => {
	it('без прокси — адрес сокета, X-Forwarded-For игнорируется (его может прислать кто угодно)', () => {
		expect(resolveClientIp('1.2.3.4', '10.0.0.9', 0)).toBe('10.0.0.9')
	})
	it('за одним прокси — последнее звено цепочки; подделанные клиентом левые звенья не учитываются', () => {
		expect(resolveClientIp('6.6.6.6, 203.0.113.7', '127.0.0.1', 1)).toBe('203.0.113.7')
	})
	it('за двумя прокси — второе с конца', () => {
		expect(resolveClientIp('6.6.6.6, 203.0.113.7, 10.1.1.1', '127.0.0.1', 2)).toBe('203.0.113.7')
	})
	it('заголовка нет — адрес сокета', () => {
		expect(resolveClientIp(undefined, '127.0.0.1', 1)).toBe('127.0.0.1')
	})
})
