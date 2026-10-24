---
name: ui-kit
description: Дизайн-система Dinastia packages/ui — компоненты shadcn/ui (Button, Input, Dialog, Sheet, Tabs, DataTable, Form-поля, Toast, EmptyState, PageHeader, Card…) на Tailwind 4, токены цветов и отступов CSS-переменными, тёмная тема, брендинг школы (основной цвет, логотип) через настройки, формы react-hook-form + zod, иконки lucide-react, доступность (клавиатура, фокус, aria, контраст), адаптивность. Использовать при вёрстке любого экрана и компонента, «сделай красиво», «цвет школы», «компонент», «модалка», «форма».
---

# UI-kit

> Статус: целевой — сверить с кодом в фазе 0 (пункт 0.7).

`packages/ui` — ядро: продуктовые задачи компоненты **используют**; новый общий компонент — запрос к ядру
(или правка с разрешения). Компонент только для одного модуля — `features/<m>/components/`.

## Что есть

| Нужно | Компонент (`@dinastia/ui`) |
|---|---|
| заголовок экрана с действиями, хлебные крошки | `PageHeader` |
| кнопка, группа, меню | `Button`, `ButtonGroup`, `DropdownMenu` |
| поля | `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `Switch`, `RadioGroup`, `DatePicker`, `RichTextEditor` |
| форма | `Form`, `FormField` (обёртки react-hook-form) |
| окна | `Dialog`, `Sheet`, `AlertDialog` (`confirm()`-хелпер) |
| вкладки, аккордеон | `Tabs`, `Accordion` |
| таблица | `DataTable` (TanStack Table) — в CRUD используется через ресурс |
| пусто / ошибка / загрузка | `EmptyState`, `ErrorState`, `Skeleton`, `Spinner` |
| статусы | `Badge` (`tone`: neutral, info, success, warning, danger) |
| прогресс | `Progress`, `ProgressRing` |
| уведомления | `toast` (sonner) |
| dnd-список | `SortableList` (dnd-kit) |
| файлы | `FileDropzone`, `ImageInput` (скилл `files-media`) |

Список — `packages/ui/src/index.ts`; пропсы — по типам. Не выдумывай пропсы.

## Стиль

- Только токены: `bg-background`, `text-muted-foreground`, `border`, `bg-primary`, `text-primary-foreground`,
  `ring`. **Никаких** `#hex`, `text-blue-600`, произвольных `px` в продуктовом коде.
- Отступы — шкала Tailwind (`gap-2/4/6`, `p-4/6`); радиусы — `rounded-md`/`rounded-lg`.
- Типографика — классы `text-sm` (интерфейс), `text-base` (контент урока), заголовки через `PageHeader`/`h2.text-xl`.
- Тёмная тема — автоматически через токены; проверяй оба режима.
- **Брендинг школы**: `settings.branding.primary` → `--primary` / `--primary-foreground` (контраст вычисляет ядро),
  логотип и фавикон — из настроек. Цвет школы — только через `primary`.

## Формы вне ресурса

```tsx
const form = useForm<CourseCreate>({ resolver: zodResolver(CourseCreate), defaultValues: { title: '' } })
<Form form={form} onSubmit={form.handleSubmit(onSubmit)}>
  <FormField name="title" label={t('courses:fields.title')} render={(f) => <Input {...f} />} />
  <Button type="submit" loading={mutation.isPending}>{t('common:save')}</Button>
</Form>
```

Схема — та же zod из контракта; серверные ошибки `issues` раскладываются по полям хелпером `applyServerErrors`.

## Доступность и адаптивность

- Всё управляется с клавиатуры; видимый фокус; у иконок-кнопок — `aria-label` (через `t`).
- Контраст текста ≥ 4.5:1 (проверяется для цвета школы).
- Мобильная ширина от 360px; таблицы на мобиле — карточками (`DataTable` делает сам), сайдбар — `Sheet`.
- Анимации уважают `prefers-reduced-motion`.

## Остановись и спроси, если

- нужного компонента нет, а он нужен больше чем одному модулю;
- дизайн требует отступить от токенов (особый цвет, шрифт).
