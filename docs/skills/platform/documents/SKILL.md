---
name: documents
description: Генерация документов в Dinastia — PDF из React/HTML-шаблона через Chromium в фоновой задаче (сертификаты, справки), defineDocument (ключ, zod-схема данных, компонент шаблона, размер страницы), результат — private-файл в files; экспорт таблиц в xlsx/csv через defineExport (колонки, запрос, фильтры как у ресурса) фоновой задачей с уведомлением; печатные шрифты и кириллица. Использовать для «сертификат», «PDF», «выгрузка в Excel», «экспорт», «отчёт файлом» — аналог шаблонов отчётов GaskarFM.
---

# Документы и экспорт

> Статус: сверено с кодом — PDF в 4.7 (`kernel/documents`, сертификаты), экспорт таблиц в 4.6 (`kernel/exports`).

Документы делаются **только в фоновой задаче** (D-013): запрос ставит задачу, клиент ждёт статус и получает файл.

## PDF

Ядро — `apps/api/src/kernel/documents/` (D-059). Образец — сертификат `modules/certificates/document.tsx`:

```tsx
export const certificateDocument = defineDocument({
	key: 'certificates.certificate',
	schema: CertificateData, // zod: всё, что нужно вёрстке, уже посчитано (HTML текста, дата строкой, data URI картинок)
	orientation: (d) => d.orientation, // лист A4, ориентация может зависеть от данных
	render: (d) => <Certificate d={d} />, // React без хуков → renderToStaticMarkup
	example: { … }, // образец данных — предпросмотр и тест
})

// в задаче (никогда в запросе):
const pdf = await renderPdf(certificateDocument, data) // Uint8Array
const fileId = await storeFile(ctx, { purpose: 'certificates.pdf', name, mime: PDF_MIME, body: pdf, ownerMemberId })
```

- `documentHtml(def, data)` — полный HTML: `@page` A4 без полей, шрифты **PT Serif** и **PT Sans** (латиница и кириллица,
  `@fontsource`, встроены data URI — `kernel/documents/fonts.ts`). Его же показывает предпросмотр в браузере (`iframe sandbox`,
  `srcDoc`) — PDF для предпросмотра не нужен.
- `renderPdf` — `playwright-core`: один браузер на процесс воркера (закрывает `closeBrowser()` при остановке), на документ —
  контекст **без JavaScript и без сети** (все запросы отклоняются): картинки — только `data:` URI (задача читает файл из S3 —
  `getObject`), текст пользователя — `toHtml` из `@dinastia/contracts/rich-text/server` (экранирует). На macOS — установленный Google
  Chrome (`channel: 'chrome'`, как e2e), в Linux — `pnpm exec playwright install --with-deps chromium` (CI, образ воркера).
- Размеры в `mm`, лист чуть меньше A4 (`209.5mm`) — иначе округление даёт вторую пустую страницу.
- Файл — `storeFile` (`kernel/storage/files.ts`): объект в S3 + готовая строка `files`; назначение без `defineFilePurpose` — пользователь
  такой файл загрузить не может. Ссылка на скачивание — `ctx.files.signedUrl(id, { ttlSeconds: 600, download: true })` после проверки
  прав сервисом.
- Задача документа — без повторов (`retry: { limit: 0 }`), сбой → статус `failed` у сущности, повтор — действием пользователя
  (сертификаты: «Выдать прошедшим»). Печать — внутри точки сохранения (`ctx.db.transaction`), чтобы статус `failed` записался.
- Тест: текст PDF читается обратно (`unpdf` — `extractText`), кириллица, номер; `closeBrowser()` в `afterAll`.

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

## Готово, когда

Документ генерируется из задачи на тестовых данных, кириллица и разметка корректны (текст PDF читается обратно, вид —
снимок предпросмотра в e2e), экспорт большой выборки (10 тыс. строк) проходит без роста памяти. `pnpm check` зелёный.

## Остановись и спроси, если

- нужен docx/редактируемый формат или электронная подпись документа;
- документ содержит юридически значимые данные (справки об обучении с лицензией).
