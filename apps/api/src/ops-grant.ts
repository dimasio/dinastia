// pnpm ops:grant <email> [имя] — сделать пользователя оператором SaaS (5.6, D-026). Выдаётся только так — доступом к серверу,
// не из интерфейса. Пользователя нет — создаётся с разовым паролем (печатается один раз); второй фактор оператор включает
// сам при первом входе в /ops. `--revoke` — снять права.
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { auth } from './kernel/auth/auth.ts'
import { users } from './kernel/auth/schema.ts'
import { db, pool } from './kernel/db/client.ts'

const args = process.argv.slice(2)
const revoke = args.includes('--revoke')
const [email, name] = args.filter((a) => a !== '--revoke')
if (!email) throw new Error('usage: ops:grant <email> [имя] [--revoke]')
const normalized = email.trim().toLowerCase()

let [user] = await db.select().from(users).where(eq(users.email, normalized))
let password: string | null = null
if (!user && !revoke) {
	password = randomBytes(12).toString('base64url')
	const res = await auth.api.signUpEmail({ body: { email: normalized, password, name: name ?? normalized } })
	;[user] = await db.select().from(users).where(eq(users.id, res.user.id))
}
if (!user) throw new Error(`пользователь ${normalized} не найден`)
await db
	.update(users)
	.set({ platformRole: revoke ? null : 'operator', emailVerified: true })
	.where(eq(users.id, user.id))
await pool.end()
console.log(
	revoke
		? `ops:grant — права оператора сняты: ${normalized}`
		: `ops:grant — ok: ${normalized} — оператор${password ? `; разовый пароль: ${password}` : ''}. Вход: /ops (пароль + код из приложения)`,
)
