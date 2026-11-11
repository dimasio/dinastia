// Юридическое школы (5.5, скилл personal-data): реквизиты оператора ПДн и согласие на обработку ПДн школой.
import { and, eq } from 'drizzle-orm'
import { consents } from '#/kernel/auth/schema.ts'
import type { Tx } from '#/kernel/context.ts'
import { LEGAL_VERSIONS } from '#/kernel/legal.ts'
import { settingsFor } from '#/kernel/settings/settings.ts'
import { schoolsSettingsTable } from './schema.ts'
import { schoolsSettings } from './settings.ts'

/** Реквизиты для ученика: пустой оператор — название школы, пустая политика — шаблон Dinastia (null). */
export async function schoolLegal(tx: Tx, school: { name: string }) {
	const s = await settingsFor(tx).all(schoolsSettings)
	return {
		operator: s.pdOperator || school.name,
		contact: s.pdContact || null,
		privacyUrl: s.privacyUrl || null,
	}
}

/**
 * Версия текста, с которым соглашается ученик: своя политика школы — по времени последнего изменения реквизитов,
 * шаблон — версия шаблона и время реквизитов (в шаблон подставляются они).
 */
async function pdVersion(tx: Tx) {
	const s = await settingsFor(tx).all(schoolsSettings)
	const [row] = await tx.select({ updatedAt: schoolsSettingsTable.updatedAt }).from(schoolsSettingsTable).limit(1)
	const at = row?.updatedAt.toISOString() ?? 'default'
	return s.privacyUrl ? `url@${at}` : `${LEGAL_VERSIONS.schoolPrivacy}@${at}`
}

/**
 * Согласие на обработку ПДн школой (`pd_processing`) — при присоединении ученика и принятии приглашения сотрудником.
 * Уже дано на эту версию текста — повторно не пишется (второй курс той же школы).
 */
export async function recordPdConsent(tx: Tx, input: { userId: string; schoolId: string; ip: string | null }) {
	const version = await pdVersion(tx)
	const [given] = await tx
		.select({ id: consents.id })
		.from(consents)
		.where(
			and(
				eq(consents.userId, input.userId),
				eq(consents.schoolId, input.schoolId),
				eq(consents.kind, 'pd_processing'),
				eq(consents.version, version),
			),
		)
		.limit(1)
	if (given) return
	await tx.insert(consents).values({ ...input, kind: 'pd_processing', version })
}
