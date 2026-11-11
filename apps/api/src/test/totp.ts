// Код TOTP (RFC 6238: SHA-1, 6 цифр, шаг 30 с) из ссылки otpauth:// — как у приложения-аутентификатора (тесты 2FA, 5.6).
import { createHmac } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32(input: string) {
	let bits = ''
	for (const ch of input.replace(/=+$/, '').toUpperCase()) bits += ALPHABET.indexOf(ch).toString(2).padStart(5, '0')
	const bytes = bits.match(/.{8}/g) ?? []
	return Buffer.from(bytes.map((b) => Number.parseInt(b, 2)))
}

export function totp(uriOrSecret: string, at = Date.now()) {
	const secret = uriOrSecret.startsWith('otpauth://')
		? (new URL(uriOrSecret).searchParams.get('secret') ?? '')
		: uriOrSecret
	const counter = Buffer.alloc(8)
	counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
	const hmac = createHmac('sha1', base32(secret)).update(counter).digest()
	const offset = (hmac.at(-1) ?? 0) & 0xf
	const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
	return code.toString().padStart(6, '0')
}
