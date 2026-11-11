---
name: documents
description: Генерация документов в Dinastia — PDF из React/HTML-шаблона через Chromium в фоновой задаче (сертификаты, справки), defineDocument (ключ, zod-схема данных, компонент шаблона, размер страницы), результат — private-файл в files; экспорт таблиц в xlsx/csv через defineExport (колонки, запрос, фильтры как у ресурса) фоновой задачей с уведомлением; печатные шрифты и кириллица. Использовать для «сертификат», «PDF», «выгрузка в Excel», «экспорт», «отчёт файлом» — аналог шаблонов отчётов GaskarFM.
---

# Документы и экспорт

> Статус: целевой — PDF сверить с кодом в 4.7; экспорт таблиц уже по коду (4.6, `kernel/exports`).

Документы делаются **только в фоновой задаче** (D-013): запрос ставит задачу и возвращает её id, клиент ждёт
статус и получает файл.

## PDF

```ts
// apps/api/src/modules/certificates/documents.ts
import { z } from 'zod'
import { defineDocument } from '#/kernel/documents'
import { CertificateTemplate } from './templates/certificate'

export const certificatePdf = defineDocument({
	key: 'certificates.certificate',
	schema: z.object({
		studentName: z.string(),
		courseTitle: z.string(),
		number: z.string(),
		issuedAt: z.coerce.date(),
		layout: CertificateLayout,
	}),
	page: { size: 'A4', orientation: 'landscape', margin: 0 },
	Component: CertificateTemplate, // React-компонент → HTML (renderToStaticMarkup) → Chromium → PDF
	filePurpose: 'certificate', // private
})

// в сервисе/задаче:
const fileId = await ctx.documents.render(certificatePdf, data) // ставит задачу или выполняется в задаче
```

- Шаблон — обычный React без клиентских хуков; стили — инлайн/встроенный CSS; шрифты — из
  `packages/ui/assets/fonts` (с кириллицей), картинки — data URI или signed URL.
- Предпросмотр шаблона в браузере: `pnpm documents:preview certificates.certificate --data sample.json`.

## Экспорт таблиц

Ядро — `apps/api/src/kernel/exports/` (D-058, карточка 4.6). Образец — `modules/learning/exports.ts`:

```ts
export const courseStudentsExport = defineExport({
	key: 'learning.course-students',
	perm: 'learning.analytics',
	input: z.object({ courseId: Id, status: EnrollmentStatus.optional(), groupId: GroupFilter.optional() }),
	// в запросе: доступ к записи и область сотрудника → параметры задачи (JSON); задача выполняется без пользователя
	prepare: async (ctx, input) => ({ ...input, groups: await scopeGroupList(ctx) }),
	fileName: async (ctx, p) => `${(await courseCards(ctx, [p.courseId]))[0]?.title} — ученики`,
	columns: [
		{ key: 'name', title: 'learning:export.columns.name', width: 30 },
		{ key: 'status', title: 'learning:export.columns.status', labels: 'learning:enrollments.values.status' },
		{ key: 'progressPct', title: 'learning:export.columns.progress', type: 'percent' }, // 0–100 → 0%
		{ key: 'enrolledAt', title: 'learning:export.columns.enrolledAt', type: 'date' }, // по Москве
	],
	rows: async function* (ctx, p) { /* пачками по 500, курсор по id */ },
})
```

- Регистрация — `exports: [courseStudentsExport]` в `defineModule`; ключ — `<модуль>.<выгрузка>`.
- Процедуры ядра: `exports.start({ key, input })` (право `exports.use` — сотрудники, затем `perm` определения; 20 запусков за 10 минут),
  `exports.get({ id })` — состояние и ссылка (10 минут) только запросившему; через сутки `exports.cleanup` удаляет строку и файл.
- Задача `exports.run` без повторов: сбой → `failed` (пользователь запускает снова). Не больше `EXPORT_MAX_ROWS` (100 тыс.).
- Файл xlsx — `write-excel-file` (в памяти); заголовки — i18n, даты — по Москве, `labels` — значения словами.
- ПДн в файле: только по праву, private-файл, журнал `exports.export.created`.

UI: действие страницы ресурса `pageActions: [{ key: 'export', perm, icon, run: (input) => runExport('<ключ>', {…фильтры}) }]`
(`apps/web/src/app/exports.ts`: запуск, опрос раз в секунду до 3 минут, скачивание; ошибки `EXPORT_FAILED`/`EXPORT_TIMEOUT`).

PDF (выше) — целевой, сверить в 4.7.

## Готово, когда

Документ генерируется из задачи на тестовых данных, кириллица и разметка корректны (снапшот PNG первой страницы в
тесте), экспорт большой выборки (10 тыс. строк) проходит без роста памяти. `pnpm check` зелёный.

## Остановись и спроси, если

- нужен docx/редактируемый формат или электронная подпись документа;
- документ содержит юридически значимые данные (справки об обучении с лицензией).
