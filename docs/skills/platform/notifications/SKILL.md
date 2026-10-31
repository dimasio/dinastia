---
name: notifications
description: Уведомления в Dinastia — письма через defineEmail в modules/<m>/emails/*.tsx (компоненты react-email 6, ключ <модуль>.<письмо>, zod-схема данных, тема и тексты из i18n namespace emails, EmailLayout с названием школы, examples), регистрация defineModule({ emails }), отправка ctx.mail.send задачей mail.send в транзакции запроса, письмо с секретом (токен) — deliverEmail внутри задачи модуля, транзакционные письма MVP (приглашение, зачисление, ДЗ проверено, дедлайн, сертификат), предпросмотр pnpm emails:preview, Mailpit локально; позже — предпочтения и отписка, каналы Telegram и push. Использовать для «отправь письмо», «уведоми ученика/куратора», «шаблон письма», «напоминание».
---

# Уведомления

> Статус: сверено с кодом в фазе 1 (пункт 1.8); предпочтения и отписка — с первыми не транзакционными письмами;
> каналы кроме email — R3. Образец — письмо-приглашение `apps/api/src/modules/schools/emails/invitation.tsx`.

## Письмо

```tsx
// apps/api/src/modules/assessments/emails/submission-reviewed.tsx
import { Button, Text } from 'react-email'
import { z } from 'zod'
import { defineEmail, EmailLayout } from '#/kernel/mail/define.tsx'

export const submissionReviewedEmail = defineEmail({
	key: 'assessments.submission-reviewed', // <модуль>.<письмо>, kebab-case
	schema: z.object({
		lessonTitle: z.string(),
		status: z.enum(['accepted', 'needs_revision', 'rejected']),
		url: z.url(),
	}),
	subject: (d, t, school) => t(`emails:submissionReviewed.subject.${d.status}`, { school: school.name }),
	Component: ({ data, t, school }) => (
		<EmailLayout school={school} preview={t('emails:submissionReviewed.preview', data)}>
			<Text>{t('emails:submissionReviewed.body', data)}</Text>
			<Button href={data.url}>{t('emails:submissionReviewed.cta')}</Button>
		</EmailLayout>
	),
	examples: [{ lessonTitle: 'Свет и тень', status: 'accepted', url: 'http://demo.dinastia.localhost:5173/learn' }],
})
// modules/assessments/index.ts: defineModule({ …, emails: [submissionReviewedEmail] })
```

Отправка — из сервиса, подписчика или задачи:

```ts
await ctx.mail.send(submissionReviewedEmail, { to: student.email, data: { lessonTitle, status, url } })
```

- `ctx.mail.send` проверяет данные схемой и ставит задачу `mail.send` в транзакции (откат — письма нет); задача
  рендерит шаблон (HTML + текстовая версия) и отправляет через транспорт ядра (SMTP; в тестах — память).
- **Секреты в данные письма не кладутся** — они лежат в очереди открытым текстом. Письмо со ссылкой-токеном рендерит
  и отправляет задача модуля сама: `deliverEmail(ctx.school, email, { to, data })` (образец — `sendInvitation` в
  `schools/invitations.service.ts`: задача выпускает токен, в БД — хэш).
- Отправитель — «<Название школы> <адрес из `SMTP_FROM`>».
- Тексты — namespace `emails` (`packages/i18n/locales/ru/emails.json`); подвал и шапка — `EmailLayout`.
- Даты — `formatDate(d, 'Europe/Moscow')` из `@dinastia/i18n` (часовой пояс школы — с её настройками).
- Ссылки — абсолютные на домен школы: `` `${appOrigin(ctx.school.slug)}/learn/…` `` (`#/kernel/config.ts`).
- Массовое — не в цикле из запроса, а задачей батчами (скилл `background-jobs`).

## Предпросмотр и проверка

- `pnpm emails:preview` — HTML и текст всех писем по `examples` в папку `.emails` внутри `apps/api` (создаёт команда, в git не хранится; открыть в браузере).
- Локально письма падают в Mailpit: http://localhost:8025 (воркер запущен — `pnpm dev`).
- Тест `apps/api/src/kernel/mail/mail.test.ts` рендерит каждый пример каждого письма: нет пропущенных строк i18n.
- В интеграционном тесте: `await lastMailTo(email)` (`#/test/jobs.ts`) — выполнит очередь и вернёт письмо.

## Готово, когда

Письмо уходит из сервиса или по событию (интеграционный тест: действие → задача → письмо), пример рендерится,
строки — в i18n. `pnpm check` зелёный.

## Остановись и спроси, если

- нужна маркетинговая рассылка (согласия, отписка по 38-ФЗ «О рекламе») — R3;
- нужен новый канал (Telegram, SMS, push).
