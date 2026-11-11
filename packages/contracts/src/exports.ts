// Выгрузки таблиц в xlsx (скилл documents): `start` ставит фоновую задачу, `get` — состояние и ссылка на файл (только
// запросившему; ссылка короткая, файл живёт сутки).
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { DateTime, Id } from './common/index.ts'

export const EXPORT_STATUSES = ['pending', 'ready', 'failed'] as const

export const ExportState = z.object({
	id: Id,
	key: z.string(),
	status: z.enum(EXPORT_STATUSES),
	/** Строк в файле (у готовой). */
	rows: z.number().int(),
	/** Ссылка на скачивание (10 минут) — у готовой. */
	url: z.string().nullable(),
	createdAt: DateTime,
	expiresAt: DateTime,
})
export type ExportState = z.infer<typeof ExportState>

export const exportsContract = {
	/** Запустить выгрузку `key` (`defineExport` на сервере) с входом по её схеме; неизвестная — `EXPORT_UNKNOWN`. */
	start: oc
		.route({ method: 'POST', path: '/school/exports', successStatus: 201 })
		.input(z.object({ key: z.string().max(80), input: z.record(z.string(), z.unknown()) }))
		.output(ExportState),
	get: oc
		.route({ method: 'GET', path: '/school/exports/{id}' })
		.input(z.object({ id: Id }))
		.output(ExportState),
}
