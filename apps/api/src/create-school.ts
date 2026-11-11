// pnpm --filter @dinastia/api exec tsx src/create-school.ts <slug> <название> <email владельца> <пароль> [имя владельца]
// Школа сразу с владельцем — для разработки и e2e (в продукте школы создаёт оператор в /ops, 5.6).
import { eq } from 'drizzle-orm'
import { auth } from './kernel/auth/auth.ts'
import { users } from './kernel/auth/schema.ts'
import { config } from './kernel/config.ts'
import { db, pool } from './kernel/db/client.ts'
import { createSchool } from './modules/schools/service.ts'

if (config.NODE_ENV === 'production')
	throw new Error('create-school запрещён в production: школы создаёт оператор в /ops')

const [slug, name, email, password, ownerName] = process.argv.slice(2)
if (!slug || !name || !email || !password)
	throw new Error('usage: create-school <slug> <название> <email владельца> <пароль> [имя владельца]')
const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
const userId =
	found?.id ?? (await auth.api.signUpEmail({ body: { email, password, name: ownerName ?? email } })).user.id
const { school } = await createSchool({ slug, name }, { userId })
await pool.end()
console.log(`create-school — ok: ${school.slug} («${school.name}»), владелец ${email}`)
