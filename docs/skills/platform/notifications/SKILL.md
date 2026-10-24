---
name: notifications
description: Уведомления в Dinastia — письма через defineEmail в modules/<m>/emails/*.tsx (React Email, ключ, zod-схема данных, тема из i18n, брендинг школы), отправка ctx.mail.send в фоновой задаче, транзакционные письма MVP (приглашение, зачисление, ДЗ проверено, дедлайн, сертификат), отписка и предпочтения, предпросмотр шаблонов, Mailpit локально; после MVP — каналы Telegram и push. Использовать для «отправь письмо», «уведоми ученика/куратора», «шаблон письма», «напоминание».
---

# Уведомления

> Статус: целевой — сверить с кодом в фазе 1 (пункт 1.8); каналы кроме email — R3.

## Письмо

```tsx
// apps/api/src/modules/assessments/emails/submission-reviewed.tsx
import { z } from 'zod'
import { defineEmail, EmailLayout, Button, Text } from '@/kernel/mail'

export const submissionReviewedEmail = defineEmail({
  key: 'assessments.submission-reviewed',
  schema: z.object({
    studentName: z.string(), lessonTitle: z.string(),
    status: z.enum(['accepted', 'needs_revision', 'rejected']), url: z.string().url(),
  }),
  category: 'learning',               // для предпочтений: transactional (нельзя отписаться) | learning | marketing
  subject: (d, t) => t(`emails:submissionReviewed.subject.${d.status}`, d),
  Component: ({ data, t, school }) => (
    <EmailLayout school={school}>
      <Text>{t('emails:submissionReviewed.body', data)}</Text>
      <Button href={data.url}>{t('emails:submissionReviewed.cta')}</Button>
    </EmailLayout>
  ),
})
```

Отправка — из подписчика события или задачи:

```ts
on(submissionReviewed, async (ctx, e) => {
  const s = await getSubmissionForEmail(ctx, e.submissionId)
  await ctx.mail.send(submissionReviewedEmail, { to: s.student, data: { … } })
})
```

- `ctx.mail.send` ставит задачу отправки; провайдер — за интерфейсом ядра (D-012).
- `to` — участник (`member`) или email; язык и предпочтения берутся из участника; `category: learning` не
  отправляется, если ученик отписался.
- Ссылки — абсолютные на домен школы (`ctx.school.url('/learn/…')`).
- От имени: «<Название школы> <noreply@домен>», ответ — на email школы из настроек.
- Не отправлять письмо в цикле по ученикам из запроса — массовое — задачей батчами.

## Предпросмотр и проверка

- `pnpm emails:preview` — все шаблоны с примерами данных (`examples` в `defineEmail`).
- Локально письма падают в Mailpit: http://localhost:8025.

## Готово, когда

Письмо уходит по событию (интеграционный тест: событие → задача → письмо в тестовом транспорте), шаблон
корректен в предпросмотре, строки — в i18n. `pnpm check` зелёный.

## Остановись и спроси, если

- нужна маркетинговая рассылка (согласия, отписка по 38-ФЗ «О рекламе») — R3;
- нужен новый канал (Telegram, SMS, push).
