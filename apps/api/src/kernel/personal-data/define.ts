// Данные человека в модуле (скилл personal-data, 5.5): модуль объявляет `personalData` в `defineModule` — что выгрузить по
// запросу субъекта и как обезличить участника. Ядро собирает части всех модулей: архив данных и удаление ученика.
import type { PgTable } from 'drizzle-orm/pg-core'
import type { BaseCtx } from '../context.ts'
import type { ArchiveEntry } from '../exports/define.ts'

/** Участник школы, чьи данные выгружаются или обезличиваются. */
export interface DataSubject {
	memberId: string
	userId: string
	/** Почта в нижнем регистре: приглашения на неё. */
	email: string
}

export interface PersonalDataPart {
	/**
	 * Данные участника в модуле: `data` — раздел `data.json` (ключ — имя модуля), `files` — файлы в архив (путь внутри
	 * архива). Только этой школы: ctx — транзакция школы.
	 */
	export: (
		ctx: BaseCtx,
		subject: DataSubject,
	) => Promise<{ data: unknown; files: Extract<ArchiveEntry, { fileId: string }>[] }>
	/**
	 * Обезличить: удалить файлы и тексты участника (`ctx.files.remove`, «Удалено» вместо текста); оценки, баллы, статусы и
	 * даты — оставить (статистика школы). Вызывается до замены пользователя на заглушку, в той же транзакции.
	 */
	anonymize: (ctx: BaseCtx, subject: DataSubject) => Promise<void>
	/** Таблицы модуля с данными участника, которые покрывает часть, — для теста-стража (новая pii()-колонка не забыта). */
	tables: PgTable[]
}

export const definePersonalData = (part: PersonalDataPart) => part
