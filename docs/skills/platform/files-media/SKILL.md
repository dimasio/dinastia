---
name: files-media
description: Файлы и медиа в Dinastia — загрузка напрямую в S3 по presigned URL (files.createUpload → PUT → files.complete, подписаны тип и размер), назначение файла defineFilePurpose (ключ <модуль>.<назначение>, maxSize, mime, perm) в defineModule({ files }), таблица files (pending/ready), чтение только по подписанной ссылке ctx.files.signedUrl / signFileKey, удаление ctx.files.remove (объект — задачей), очистка незавершённых загрузок, компоненты ImageInput и UserAvatar, uploadFile в вебе, AWS SDK v3, SeaweedFS локально; позже — превью картинок, видео через провайдера (Kinescope), квоты. Использовать для «загрузка файла», «обложка», «аватар», «вложение к ДЗ», «картинка», «видео в уроке», «скачать файл».
---

# Файлы и медиа

> Статус: сверено с кодом в 2.7. Образцы — аватар участника (`modules/schools/files.ts`, `updateMyAvatar`, экран
> «Профиль»), обложка курса (`courses.cover`, `updateCourse`, `ImageInput preview="wide"`) и медиа урока
> (`courses.lesson-image`, `courses.lesson-file`, файлы блоков — скилл `lesson-blocks`). Превью картинок,
> public-ссылки, видео — целевое.

Хранилище — S3-совместимое в РФ (D-011), локально SeaweedFS (D-037), клиент — AWS SDK v3 (D-047). Файлы не проходят
через API-сервер.

## Поток загрузки

```
клиент: files.createUpload({ purpose, name, mime, size }) → { fileId, uploadUrl, headers }   строка files: pending
клиент: PUT uploadUrl (headers, тело файла; прогресс)      → S3   подписаны content-type и content-length — другой
                                                                  размер или тип S3 не примет
клиент: files.complete({ id: fileId })                     → сервер сверяет объект (HEAD): размер, тип → ready
клиент: сохраняет fileId в сущности (schools.updateMyAvatar({ fileId }))
```

В вебе это делает `uploadFile(purpose, file, onProgress)` (`apps/web/src/app/files.ts`) → `fileId`. Компонент
`ImageInput` (`@dinastia/ui`) — выбор, проверка типа и размера до загрузки, прогресс, удаление; загрузку ему передаёт
экран:

```tsx
<ImageInput
	value={me.member.avatarUrl}
	name={me.user.name}
	accept={AVATAR.mime}
	maxSize={AVATAR.maxSize}
	upload={async (file, onProgress) => save(await uploadFile(AVATAR.purpose, file, onProgress))}
	onRemove={() => save(null)}
	errorText={(e) => t(errorText(e), { ns: 'errors' })}
	testId="profile-avatar"
/>
```

Лимиты, которые нужны и серверу, и форме, — константой в контракте (`AVATAR` в `@dinastia/contracts/schools`).

## Назначение файла

```ts
// apps/api/src/modules/courses/files.ts
import { defineFilePurpose, MB } from '#/kernel/storage/files.ts'

export const coverPurpose = defineFilePurpose({
	key: 'courses.cover', // <модуль>.<назначение>
	maxSize: 5 * MB, // ≤ 2 ГБ
	mime: ['image/jpeg', 'image/png', 'image/webp'],
	perm: 'courses.manage', // кто может загружать; без perm — любой участник
})
// modules/courses/index.ts: defineModule({ …, files: [coverPurpose] })
```

Ошибки: `FILE_PURPOSE_UNKNOWN`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE` (до выдачи ссылки), `FILE_NOT_UPLOADED`,
`FILE_UPLOAD_MISMATCH` (при подтверждении), `FILE_NOT_FOUND`, `FILE_INVALID` (файл не того назначения или чужой).

## Правила

- Сущность хранит `file_id` (`tenantRef` на `files`), не URL и не ключ объекта.
- Привязывая файл к сущности, сервис проверяет: `ready`, нужное `purpose`, загрузил этот участник
  (`ctx.files.get(fileId)` — образец `updateMyAvatar`).
- Ключ объекта `schools/<schoolId>/<purpose>/<fileId>` строит ядро; путь вручную не строится.
- **Чтение — только по подписанной ссылке** (D-047): `await ctx.files.signedUrl(fileId, { ttlSeconds, download })`
  в сервисе после проверки прав на сущность; в выборках с join — `signFileKey(files.key)` (без лишнего запроса).
  Ссылка живёт час по умолчанию; в ответе API — URL, в БД — нет.
- Замена или удаление файла — `ctx.files.remove(fileId)`: строка удаляется в транзакции, объект — задачей
  `files.delete-object` после коммита.
- Незавершённые загрузки (`pending` > 24 ч) удаляет задача ядра `files.cleanup-pending` (раз в час).
- Имя файла (`files.name`) может содержать ПДн — в логи не пишется.
- Тип файла заявляет клиент; содержимое сервер не разбирает. Отдаётся с заявленным типом — поэтому в `mime`
  назначения не включать `text/html`, `image/svg+xml` и прочее исполняемое браузером.

## Тест

Интеграционный — на настоящем SeaweedFS (`apps/api/src/kernel/storage/files.test.ts`): `createUpload` → `fetch(PUT)`
→ `complete`; файл другой школы не виден; подписанная ссылка читается, без подписи — 403. e2e — `setInputFiles` на
`<testId>-file` (`tests/e2e/profile.spec.ts`).

## Позже

- Превью картинок (`file_variants`, задача с библиотекой обработки изображений) — обложки пока показываются как есть
  (кадрирование 16:9 при показе).
- Очистка неиспользуемых файлов (картинки и файлы, удалённые из уроков, — на них может ссылаться опубликованная
  версия).
- Публичные ссылки без подписи (CDN) — с прод-инфраструктурой.
- Видео: блок `video` (`{ source: 'provider', provider: 'kinescope', videoId }` или встраивание по белому списку),
  загрузка через `ctx.video` ядра, статус — вебхуком (скилл `integrations`).
- Квоты школы.

## Готово, когда

Файл загружается из UI, сохраняется в сущности, private-файл открывается только тем, у кого есть право на
сущность (тест), превышение лимита или неверный тип — понятная ошибка. `pnpm check` зелёный.

## Остановись и спроси, если

- нужен новый провайдер видео или обработка (транскодинг, водяные знаки);
- файл больше 2 ГБ или нужна загрузка частями;
- нужно хранить документы с персональными данными (паспорт) — 152-ФЗ.
