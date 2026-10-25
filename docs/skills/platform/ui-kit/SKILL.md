---
name: ui-kit
description: Дизайн-система Dinastia packages/ui — компоненты shadcn/ui (Button, Input, Dialog, Sheet, Tabs, DataTable, Form-поля, Toast, EmptyState, PageHeader, Card…) на Tailwind 4, токены цветов и отступов CSS-переменными, тёмная тема, брендинг школы (основной цвет, логотип) через настройки, формы react-hook-form + zod, иконки lucide-react, доступность (клавиатура, фокус, aria, контраст), адаптивность. Использовать при вёрстке любого экрана и компонента, «сделай красиво», «цвет школы», «компонент», «модалка», «форма».
---

# UI-kit

> Статус: сверено с кодом в фазе 0 (пункт 0.7); брендинг школы (`--primary` из `school_branding`) — фаза 1+.

`packages/ui` — ядро: продуктовые задачи компоненты **используют**; новый общий компонент — запрос к ядру
(или правка с разрешения). Компонент только для одного модуля — `features/<m>/components/`.

## Что есть

Сейчас в `@dinastia/ui` (`packages/ui/src/index.ts`): `Button`, `Input`, `Label`, `Field` (подпись + подсказка/ошибка
с aria), `Card*`, `Alert*`, `Badge`, `Avatar*`, `Separator`, `Skeleton`, `Sheet*`, `DropdownMenu*`, `PageHeader`,
`EmptyState`, `UserAvatar` (фото или инициалы), `ImageInput` (загрузка картинки — скилл `files-media`), `Toaster` + `toast`, `ThemeProvider`/`useTheme`, `cn`. Стили — `import '@dinastia/ui/styles.css'`
(уже в `main.tsx`).

Дальше по фазам: `Dialog`/`AlertDialog`, `Tabs`, `Select`/`Combobox`, `Checkbox`/`Switch`/`RadioGroup`, `DatePicker`,
`DataTable`, `RichTextEditor`, `SortableList`, `FileDropzone`/`ImageInput`, `Progress`.

Новый компонент shadcn (ядро — с разрешения или в задаче фазы):

```bash
cd packages/ui && npx shadcn@4.22.1 add <компонент> --yes
```

После генерации **обязательно**:
1. импорт `cn` — заменить `from "cn"` на `from "#/lib/utils.ts"` и убрать пакет `cn` из `package.json` (CLI ставит его
   вместо нашего алиаса);
2. `next-themes` не использовать — тема из `#/lib/theme.tsx`;
3. `pnpm lint:fix && pnpm typecheck` — строгий `exactOptionalPropertyTypes` иногда требует поправить обёртку
   (как в `sonner.tsx`);
4. экспорт в `src/index.ts`.

Пропсы — по типам компонента; не выдумывай.

## Стиль

- Только токены: `bg-background`, `text-muted-foreground`, `border`, `bg-primary`, `text-primary-foreground`,
  `ring`. **Никаких** `#hex`, `text-blue-600`, произвольных `px` в продуктовом коде.
- Отступы — шкала Tailwind (`gap-2/4/6`, `p-4/6`); радиусы — `rounded-md`/`rounded-lg`.
- Типографика — классы `text-sm` (интерфейс), `text-base` (контент урока), заголовки через `PageHeader`/`h2.text-xl`.
- Тёмная тема — автоматически через токены; проверяй оба режима.
- **Брендинг школы**: `school_branding.primary_color` → `--primary` / `--primary-foreground` (контраст вычисляет ядро),
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
