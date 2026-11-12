// pnpm db:seed — учебный центр АИР «Горизонт» для локальной работы (скилл local-env, seed/airgorizont.ts). Центр уже есть —
// ничего не делает; пересоздать: pnpm db:reset && pnpm db:seed.
import { appOrigin, config } from './kernel/config.ts'
import { pool } from './kernel/db/client.ts'
import { AIRGORIZONT, OPERATOR, PEOPLE, seedAirgorizont } from './seed/airgorizont.ts'

if (config.NODE_ENV === 'production') throw new Error('db:seed запрещён в production')

const { created } = await seedAirgorizont()
const roles = { owner: 'владелец', admin: 'администратор', curator: 'куратор', student: 'слушатель' } as const
console.log(
	[
		created
			? `db:seed — ok: учебный центр ${AIRGORIZONT.name} — ${appOrigin(AIRGORIZONT.slug)}`
			: `db:seed — центр ${AIRGORIZONT.slug} уже есть; пересоздать: pnpm db:reset && pnpm db:seed`,
		`пароль у всех — ${AIRGORIZONT.password}`,
		...Object.entries(PEOPLE).map(
			([k, p]) => `  ${roles[k as keyof typeof roles].padEnd(14)} ${p.email.padEnd(32)} ${p.name}`,
		),
		`  ${'оператор /ops'.padEnd(14)} ${OPERATOR.email.padEnd(32)} ${appOrigin()}/ops`,
	].join('\n'),
)
await pool.end()
