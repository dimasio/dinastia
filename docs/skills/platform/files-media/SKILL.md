---
name: files-media
description: Файлы и медиа в Dinastia — загрузка напрямую в S3 по presigned URL (files.createUpload → PUT → files.complete), назначение файла defineFilePurpose (лимиты размера, MIME, видимость private/public), таблица files, подписанные ссылки на чтение ctx.files.signedUrl, компоненты FileDropzone/ImageInput, картинки (превью, размеры), видео через провайдера (Kinescope) в блоке video, удаление и квоты школы, MinIO локально. Использовать для «загрузка файла», «обложка», «вложение к ДЗ», «картинка», «видео в уроке», «скачать файл».
---

# Файлы и медиа

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.7).

Хранилище — S3-совместимое в РФ (D-011), локально MinIO. Файлы не проходят через API-сервер.

## Поток загрузки

```
клиент: files.createUpload({ purpose, name, mime, size }) → { fileId, uploadUrl, headers }
клиент: PUT uploadUrl (прогресс)                          → S3
клиент: files.complete({ fileId })                        → сервер проверяет объект (размер, MIME), status=ready
клиент: сохраняет fileId в сущности (coverFileId, вложение ДЗ)
```

`ImageInput`, `FileDropzone` (`packages/ui`) делают это сами: `<ImageInput purpose="course-cover" value={id}
onChange={setId} />`; в ресурсе — `widget: 'image', purpose: '…'`.

## Назначение файла

```ts
// apps/api/src/modules/courses/files.ts
import { defineFilePurpose } from '@/kernel/storage'

export const courseCover = defineFilePurpose('course-cover', {
  maxSize: '5MB',
  mime: ['image/jpeg', 'image/png', 'image/webp'],
  visibility: 'public',          // public — CDN-ссылка без подписи; private — только signedUrl
  perm: 'courses.manage',        // кто может загружать
  image: { variants: { card: [640, 360], thumb: [160, 90] } },   // задача делает превью
})
```

- Вложения учеников, ДЗ, сертификаты — `private`. Публичное — только то, что и так видно всем ученикам (обложки).
- Ключ объекта — `schools/<schoolId>/<purpose>/<fileId>`; путь не строится вручную.
- Чтение private: `await ctx.files.signedUrl(fileId, { ttl: '15m', download: true })` — в сервисе после проверки
  прав на сущность, к которой привязан файл.
- Сущность хранит `fileId` (FK на `files`), не URL.
- Неподтверждённые загрузки (`pending` > 24 ч) удаляет задача ядра.

## Видео

- Блок `video`: `{ source: 'provider', provider: 'kinescope', videoId }` или `{ source: 'url', url }` (YouTube,
  VK Видео, Rutube — встраивание по белому списку доменов).
- Загрузка в провайдера — через `ctx.video.createUpload()` ядра (интерфейс провайдера); статус обработки приходит
  вебхуком провайдера в ядро.
- Защита: подписанные плееры провайдера, домен-рестрикции; ученик получает токен плеера через `learn`-процедуру.

## Готово, когда

Файл загружается из UI, сохраняется в сущности, private-файл открывается только тем, у кого есть право на
сущность (тест), превышение лимита/неверный MIME — понятная ошибка. `pnpm check` зелёный.

## Остановись и спроси, если

- нужен новый провайдер видео или обработка (транскодинг, водяные знаки);
- файл больше 2 ГБ или нужна загрузка частями;
- нужно хранить документы с персональными данными (паспорт) — 152-ФЗ.
