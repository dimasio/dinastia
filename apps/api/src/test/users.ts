import { auth } from '#/kernel/auth/auth.ts'

let seq = 0
/** Уникальный email для теста: тесты разных файлов идут параллельно в одной БД. */
export const uniqueEmail = (prefix = 'user') => `${prefix}-${process.pid}-${Date.now()}-${++seq}@test.local`

export const TEST_PASSWORD = 'test-password-123'

/** Пользователь с паролем через better-auth (как при регистрации). */
export async function createUser(prefix = 'user', name = 'Тест Тестов') {
	const email = uniqueEmail(prefix)
	const res = await auth.api.signUpEmail({ body: { email, password: TEST_PASSWORD, name } })
	return { id: res.user.id, email, name }
}

export const uniqueSlug = (prefix = 's') => `${prefix}-${Date.now().toString(36)}-${++seq}`
