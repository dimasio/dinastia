---
name: documents
description: Генерация документов в Dinastia — PDF из React/HTML-шаблона через Chromium в фоновой задаче (сертификаты, справки), defineDocument (ключ, zod-схема данных, компонент шаблона, размер страницы), результат — private-файл в files; экспорт таблиц в xlsx/csv через defineExport (колонки, запрос, фильтры как у ресурса) фоновой задачей с уведомлением; печатные шрифты и кириллица. Использовать для «сертификат», «PDF», «выгрузка в Excel», «экспорт», «отчёт файлом» — аналог шаблонов отчётов GaskarFM.
---

# Документы и экспорт

> Статус: целевой — сверить с кодом в фазе 4 (пункты 4.6, 4.7).

Документы делаются **только в фоновой задаче** (D-013): запрос ставит задачу и возвращает её id, клиент ждёт
статус и получает файл.

## PDF

```ts
// apps/api/src/modules/certificates/documents.ts
import { z } from 'zod'
import { defineDocument } from '@/kernel/documents'
import { CertificateTemplate } from './templates/certificate'

export const certificatePdf = defineDocument({
  key: 'certificates.certificate',
  schema: z.object({
    studentName: z.string(), courseTitle: z.string(), number: z.string(),
    issuedAt: z.coerce.date(), layout: CertificateLayout,
  }),
  page: { size: 'A4', orientation: 'landscape', margin: 0 },
  Component: CertificateTemplate,       // React-компонент → HTML (renderToStaticMarkup) → Chromium → PDF
  filePurpose: 'certificate',           // private
})

// в сервисе/задаче:
const fileId = await ctx.documents.render(certificatePdf, data)   // ставит задачу или выполняется в задаче
```

- Шаблон — обычный React без клиентских хуков; стили — инлайн/встроенный CSS; шрифты — из
  `packages/ui/assets/fonts` (с кириллицей), картинки — data URI или signed URL.
- Предпросмотр шаблона в браузере: `pnpm documents:preview certificates.certificate --data sample.json`.

## Экспорт таблиц

```ts
// apps/api/src/modules/learning/exports.ts
export const courseStudentsExport = defineExport({
  key: 'learning.course-students',
  perm: 'learning.analytics',
  input: z.object({ courseId: Id, filters: StudentFilters.optional() }),
  formats: ['xlsx', 'csv'],
  columns: [
    { key: 'name', title: 'learning:export.name' },
    { key: 'email', title: 'learning:export.email' },
    { key: 'progressPct', title: 'learning:export.progress', type: 'percent' },
    { key: 'enrolledAt', title: 'learning:export.enrolledAt', type: 'date' },
  ],
  rows: (ctx, input) => studentsCursor(ctx, input),   // async-итератор батчами — не грузить всё в память
})
```

UI: действие ресурса `action('export', { scope: 'page', export: 'learning.course-students' })` — хост ставит задачу,
показывает прогресс, по готовности — ссылка (и письмо, если дольше 30 с).

## Готово, когда

Документ генерируется из задачи на тестовых данных, кириллица и разметка корректны (снапшот PNG первой страницы в
тесте), экспорт большой выборки (10 тыс. строк) проходит без роста памяти. `pnpm check` зелёный.

## Остановись и спроси, если

- нужен docx/редактируемый формат или электронная подпись документа;
- документ содержит юридически значимые данные (справки об обучении с лицензией).
