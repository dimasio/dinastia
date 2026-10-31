---
name: rich-text
description: Форматированный текст в Dinastia — общий механизм на Tiptap для блоков text, описаний курсов, формулировок вопросов и заданий, комментариев — тип RichText (JSON-документ ProseMirror) в packages/contracts, профили расширений (lesson, compact, comment) с разрешёнными узлами и метками, компоненты RichTextEditor и RichTextView в packages/ui, валидация и очистка на сервере (ссылки, только разрешённые узлы, лимит размера), рендер в HTML для писем и PDF, извлечение текста для поиска и превью, вставка из Word/Google Docs, картинки через files. Использовать для «форматирование», «редактор текста», «вставить ссылку/картинку/таблицу в текст», «текст в письме», «добавить формулы».
---

# Форматированный текст

> Статус: сверено с кодом в 1.12 (механизм, редактор, просмотр, виджет ресурса). Картинки в ресурсе, `RichTextView`
> с подписанными ссылками и первое продуктовое поле — с курсами (фаза 2).

Хранится **JSON-документ** Tiptap/ProseMirror, а не HTML (D-010): безопасно, мигрируемо, рендерится где угодно.
Это единственный документный тип в реляционной модели (D-032): колонка `richText('<имя>')` из `@dinastia/db`
(jsonb). Внутрь документа БД не заглядывает — для поиска есть `toPlainText`; всё, что нужно фильтровать или
связывать (картинки → `files`), — отдельные колонки и таблицы.

## Где что

| Что | Где |
| --- | --- |
| профили, валидатор, очистка, утилиты | `packages/contracts/src/common/rich-text.ts` → `@dinastia/contracts/common` |
| HTML для писем и PDF | `packages/contracts/src/rich-text/server.ts` → `@dinastia/contracts/rich-text/server` |
| редактор, просмотр | `packages/ui/src/rich-text/` → `@dinastia/ui/rich-text` |
| расширения Tiptap из профиля | `packages/ui/src/rich-text/extensions.ts` |
| стили (`.rt`, `.rt-color-*`) | `packages/ui/src/styles/rich-text.css` |
| песочница (только dev) | `/dev/rich-text` (`apps/web/src/routes/dev.rich-text.tsx`), e2e `tests/e2e/rich-text.spec.ts` |

## Тип и профили

```ts
import { RichText, CompactText, CommentText, emptyDoc } from '@dinastia/contracts/common'
// контракт: zod-схема документа профиля; ошибка — 400 INVALID_INPUT с путём до узла
export const CourseInput = z.object({ title: z.string().max(200), description: RichText })
// таблица: description: richText('description')
```

| Профиль   | Где                                               | Узлы                                                                                                                                | Метки                                                                               |
| --------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `lesson`  | блок `text`, задания, описания курсов             | paragraph, heading (2–4), bulletList, orderedList, taskList, blockquote, codeBlock, image (`fileId`), table, horizontalRule, hardBreak | bold, italic, underline, strike, code, link, highlight, textStyle (цвет из палитры) |
| `compact` | формулировки вопросов, варианты ответа, подсказки | paragraph, bulletList, orderedList, image, codeBlock, hardBreak                                                                     | bold, italic, code, link                                                            |
| `comment` | переписка по заданиям, комментарии                | paragraph, bulletList, orderedList, codeBlock, hardBreak                                                                            | bold, italic, code, link                                                            |

Профиль — одна точка правды: `RICH_TEXT_PROFILES` (узлы, метки) + таблицы атрибутов в валидаторе;
`richTextExtensions(profile)` строит из него редактор. Тест `packages/ui/src/rich-text/extensions.test.ts`
сверяет: в схеме редактора ровно узлы и метки профиля, и документ, который выдаёт редактор (с атрибутами по
умолчанию: `align` ячеек, `title` ссылки…), валидатор принимает. Цвет — ключ палитры `RICH_TEXT_COLORS`
(`gray|red|orange|green|blue|purple`): в UI класс `.rt-color-<ключ>` (светлая и тёмная тема), в письмах — hex.

## Использование

```tsx
import { RichTextEditor, RichTextView } from '@dinastia/ui/rich-text'

<RichTextEditor
	profile="lesson"
	value={doc}
	onChange={setDoc}                       // документ уже приведён к профилю (sanitizeRichText)
	placeholder={t('blocks:text.placeholder')}
	uploadImage={upload}                    // (file) => { fileId, url }; без него кнопки картинки нет
	resolveFile={(id) => urls[id]}          // адрес сохранённой картинки
	aria-label={t('…')}
/>
<RichTextView doc={doc} resolveFile={(id) => urls[id]} />   // JSON → React, без Tiptap и innerHTML
```

`RichTextEditor` грузится лениво (`React.lazy`, ~146 КБ gzip — только на экранах с редактором), пока грузится —
`Skeleton`. В ресурсе: поле со схемой `RichText`/`CompactText`/`CommentText` (в том числе `.optional()`,
`.nullable()`) само получает виджет `richtext` с профилем схемы (`richTextRegistry`); обязательность «не пусто» —
`.refine((d) => !isEmptyDoc(d))` в контракте.

## Безопасность

- Сервер валидирует документ схемой профиля: неизвестные узел, метка, атрибут, поле — 400 (не «молча удалить»);
  размер ≤ 512 КБ, вложенность ≤ 24.
- Ссылки: только `http`, `https`, `mailto` (`isAllowedHref`); рендер — `rel="noopener noreferrer nofollow"`,
  `target="_blank"`, и в редакторе (`isAllowedUri`), и при просмотре, и в `toHtml`.
- Картинки — только `fileId` из `files`, не внешние URL: в схеме редактора `img` без `data-file-id` не распознаётся.
- **Никогда** `dangerouslySetInnerHTML`: просмотр — `RichTextView` (React-элементы), HTML для писем/PDF — `toHtml`
  на сервере (текст и атрибуты экранируются).
- Вставка из буфера (Word, Google Docs): лишнее отбрасывает схема редактора профиля (h1 → абзац, чужие `style`,
  `<img src>`, `<script>`), остальное — `sanitizeRichText(doc, profile)` перед `onChange`.

## Утилиты

| Функция                           | Где                                    | Для чего                                     |
| --------------------------------- | -------------------------------------- | -------------------------------------------- |
| `richTextIssues(doc, profile)`    | `@dinastia/contracts/common`           | список ошибок с путями (валидатор)           |
| `sanitizeRichText(doc, profile)`  | `@dinastia/contracts/common`           | привести к профилю (клиент, вставка)         |
| `toPlainText(doc, { maxLength })` | `@dinastia/contracts/common`           | превью в списках, поиск, `title`             |
| `isEmptyDoc(doc)`                 | `@dinastia/contracts/common`           | валидация «обязательное поле»                |
| `collectFileIds(doc)`             | `@dinastia/contracts/common`           | привязка картинок к сущности, удаление сирот |
| `toHtml(doc, { resolveFile })`    | `@dinastia/contracts/rich-text/server` | письма, PDF                                  |

## Расширить профиль

Новый узел или метка (формулы KaTeX, спойлер, видео внутри текста) — изменение ядра: узел/метка в
`RICH_TEXT_PROFILES` и таблицах атрибутов валидатора, расширение Tiptap в `extensions.ts` (+ кнопка), ветка в
`RichTextView`, `toHtml`, `toPlainText`, пример в `extensions.test.ts`; миграция не нужна (добавление обратно
совместимо). Удаление узла — несовместимо (старые документы перестанут проходить валидатор).

## Остановись и спроси, если

- нужен новый узел/метка (ядро);
- нужен совместный редактор (несколько авторов одновременно) — это realtime, вне MVP.
