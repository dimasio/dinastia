---
name: rich-text
description: Форматированный текст в Dinastia — общий механизм на Tiptap для блоков text, описаний курсов, формулировок вопросов и заданий, комментариев: тип RichText (JSON-документ ProseMirror) в packages/contracts, профили расширений (lesson, compact, comment) с разрешёнными узлами и метками, компоненты RichTextEditor и RichTextView в packages/ui, валидация и очистка на сервере (ссылки, только разрешённые узлы, лимит размера), рендер в HTML для писем и PDF, извлечение текста для поиска и превью, вставка из Word/Google Docs, картинки через files. Использовать для «форматирование», «редактор текста», «вставить ссылку/картинку/таблицу в текст», «текст в письме», «добавить формулы».
---

# Форматированный текст

> Статус: целевой — сверить с кодом в фазе 2 (пункт 2.4).

Хранится **JSON-документ** Tiptap/ProseMirror, а не HTML (D-010): безопасно, мигрируемо, рендерится где угодно.

## Тип и профили

```ts
// packages/contracts/src/common/rich-text.ts
export const RichText = richTextSchema('lesson')            // zod: проверяет узлы и метки профиля, размер ≤ 512 КБ
export const CompactText = richTextSchema('compact')
export const CommentText = richTextSchema('comment')
export const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] })
```

| Профиль | Где | Узлы | Метки |
|---|---|---|---|
| `lesson` | блок `text`, задания, описания курсов | paragraph, heading(2–4), bulletList, orderedList, taskList, blockquote, codeBlock, image (fileId), table, horizontalRule, hardBreak | bold, italic, underline, strike, code, link, highlight, textColor (палитра токенов) |
| `compact` | формулировки вопросов, варианты ответа, подсказки | paragraph, bulletList, orderedList, image, codeBlock, hardBreak | bold, italic, code, link |
| `comment` | переписка по заданиям, комментарии | paragraph, bulletList, orderedList, codeBlock, hardBreak | bold, italic, code, link |

Профиль — одна точка правды: `packages/ui/src/rich-text/profiles.ts` (расширения редактора) и
`packages/contracts/src/common/rich-text.ts` (валидатор) строятся из одного описания.

## Использование

```tsx
<RichTextEditor profile="lesson" value={doc} onChange={setDoc} placeholder={t('blocks:text.placeholder')} />
<RichTextView doc={doc} />                     // рендер без редактора
```

В ресурсе: `widget: 'richtext'` (профиль — по схеме поля).

## Безопасность

- Сервер валидирует документ схемой профиля: неизвестные узлы/атрибуты — 400 (не «молча удалить»).
- Ссылки: только `http`, `https`, `mailto`; рендер — `rel="noopener noreferrer nofollow"`, `target="_blank"`.
- Картинки — только `fileId` из `files` (рендер — подписанный/публичный URL), не внешние URL.
- **Никогда** `dangerouslySetInnerHTML` с HTML от пользователя; HTML для писем/PDF генерирует сервер из JSON
  (`toHtml(doc)` в `@dinastia/contracts/rich-text/server`).
- Вставка из буфера (Word, Google Docs) — через парсер Tiptap с профилем: лишнее отбрасывается на клиенте до
  сохранения.

## Утилиты

| Функция | Для чего |
|---|---|
| `toPlainText(doc, { maxLength })` | превью в списках, поиск, `title` |
| `toHtml(doc, { resolveFile })` | письма, PDF |
| `isEmptyDoc(doc)` | валидация «обязательное поле» |
| `collectFileIds(doc)` | привязка картинок к сущности, удаление сирот |

## Расширить профиль

Новый узел (формулы KaTeX, спойлер, видео внутри текста) — изменение ядра: расширение Tiptap + валидатор + рендер в
`toHtml` + `toPlainText` + миграция не нужна (добавление обратно совместимо). Удаление узла — несовместимо.

## Остановись и спроси, если

- нужен новый узел/метка (ядро);
- нужен совместный редактор (несколько авторов одновременно) — это realtime, вне MVP.
