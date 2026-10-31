import type { Column, ColumnBuilderBase } from 'drizzle-orm'

const PII = 'dinastiaPii'

/**
 * Колонка с персональными данными (D-022, скилл personal-data): `email: pii(text('email').notNull())`. Пометка живёт
 * в config колонки — по ней ядро проверяет маскирование в логах, а экспорт и обезличивание находят поля ПДн.
 */
export function pii<B extends ColumnBuilderBase>(builder: B): B {
	;(builder as unknown as { config: Record<string, unknown> }).config[PII] = true
	return builder
}

/** Помечена ли колонка таблицы как ПДн. */
export const isPii = (column: Column): boolean =>
	(column as unknown as { config: Record<string, unknown> }).config[PII] === true
