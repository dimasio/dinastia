---
status: current
---

# Что берём из rnd

rnd (`<путь к rnd>`) — платформа метаданных для FM. Dinastia не совместима с ней
по коду и формату (D-001, D-017). Переносятся **идеи, процессы и полезные приёмы**. Перед переносом функции агент
читает старый скилл (`rnd/app/docs/skills/**`), чтобы взять правила предметной области и подводные камни, но
реализует по скиллам Dinastia.

## Концепции платформы

| rnd                                           | Скилл там                                              | Dinastia                                                                    | Скилл здесь                     |
| -------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------- |
| модуль (`module.yaml`, `contents`, зависимости)    | `module`                                               | доменный модуль `apps/api/src/modules/<m>` + `features/<m>`, `defineModule` | `module`                        |
| класс, свойства, коллекции (`class.yaml`)          | `classes`, `classes-properties`, `classes-collections` | таблицы Drizzle + zod-схемы в контракте                                     | `db-schema`, `api-endpoints`    |
| код класса (`_onChanged`, `_ReadOnly`, `_Require`) | `classes-properties`                                   | бизнес-правила в `service.ts`, валидация в zod; UI-реактивность — в форме   | `data-access`, `admin-resource` |
| общие валидаторы                                   | `validations`                                          | общие zod-схемы и `refine` в `packages/contracts/src/common`                | `api-endpoints`                 |
| `factory`, `gQuery`                                | `data-access`                                          | `ctx.db` (Drizzle), хелперы ядра (`listQuery`/`toPage`)                    | `data-access`                   |
| словари и перечисления                             | `refbooks`                                             | pg enum / `text` + zod enum, справочники — обычные таблицы-ресурсы          | `db-schema`, `admin-resource`   |
| формы (`form.yaml`, `bind`, `visibleIf`)           | `forms`, `form-controls`                               | `defineResource` → `ResourceForm` из zod-схемы; сложные экраны — React      | `admin-resource`, `ui-kit`      |
| настройки таблиц (колонки, фильтры, поиск)         | `grid-settings`                                        | `defineResource.columns/filters/search` → `ResourceTable`                   | `admin-resource`                |
| меню, реестры из меню                              | `menus`                                                | навигация области `admin`/`learn`, пункты из `defineModule.nav`             | `web-screens`                   |
| ключи безопасности, `restrictions`                 | `security-checkpoints`                                 | `definePermissions` + `can()` + RLS на тенант                               | `permissions`                   |
| трансформации (обновление БД)                      | `transformations`                                      | миграции drizzle-kit; миграции данных — отдельный файл миграции             | `db-schema`                     |
| шаблоны асинхронных задач (по расписанию)          | `task-templates`                                       | `defineJob` (pg-boss), `schedule`                                           | `background-jobs`               |
| шаблоны отчётов и документов (docx/xlsx)           | `report-templates`                                     | PDF из HTML (сертификаты), экспорт xlsx (exceljs)                           | `documents`                     |
| MVC-приложения (портал, ЛК)                        | `mvc`                                                  | область `learn` в SPA; публичный сайт — `apps/site` пост-MVP                | `web-screens`                   |
| REST API для интеграций и мобайла                  | `rest`                                                 | OpenAPI из oRPC-контракта, тот же код                                       | `api-endpoints`                 |
| настройки приложения (стенд, компания)             | `settings`                                             | `defineSettings` школы + env-конфиг ядра                                    | `settings`                      |
| скрипты модулей на клиенте                         | `scripts`                                              | обычный код в `features/<m>`                                                | `web-screens`                   |
| «Ариадна» — сценарии проверки UI                   | `ariadna`                                              | Playwright-сценарии `tests/e2e/**`, локаторы по ролям и `data-testid`       | `testing`                       |
| локальное окружение (docker, копия БД)             | `local-env`                                            | docker compose (Postgres 18, SeaweedFS, Mailpit), сиды демо-школы                  | `local-env`                     |
| редактор модулей `/dev/modules`                    | `module_dev_tool`                                      | не переносим: описания — код, редактор — IDE + генераторы                   | —                               |
| конверсия из БД в yaml                             | `agent_flow_conversion`                                | не переносим                                                                | —                               |

## Хранение данных

В rnd описания и данные — нереляционная схема (метаданные и объекты в обобщённом виде). В Dinastia — **только
реляционная модель** (D-032): сущность rnd переносится как таблица с колонками и FK, коллекции — дочерние таблицы
или таблицы-связки, перечисления — enum. Обобщённые «ключ-значение» и JSON-объекты не переносятся.

## Процессы

| rnd                                                                            | Dinastia                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `AGENTS.md`: области «модули» и «платформа», запрет правок платформы без разрешения | то же: «продукт» и «ядро» (`AGENTS.md`)                       |
| «Если не хватает платформы» → запрос `docs/tasks/requests/<slug>/task.md`           | `docs/tasks/requests/<slug>.md`                               |
| сначала план с блокерами                                                            | то же                                                         |
| критерий готовности — `<вид>:validate` пишет `ok`, `platform:check`                 | `pnpm check` + e2e-сценарий фичи                              |
| уровни скиллов `product` / `platform` / `core`                                      | те же + `workflow`                                            |
| шесть шагов изменения продукта, карточка изменения, поэтапный `git add`             | скилл `change-workflow`                                       |
| журнал решений `D-NNN`, спеки со статусом                                           | то же                                                         |
| `id` выдаёт инструмент, не руками                                                   | uuid v7 генерирует БД/ядро; ключи реестров — генераторы       |
| «временно убрать» — `isDisabled`                                                    | фича-флаг в настройках школы или `enabled: false` в `define*` |

## Продуктовые процессы

FM-процессы rnd (заявки `requests`, склад, планирование) к LMS не относятся. Если понадобится похожий процесс
(например, заявки на обучение как в CRM), сначала читается старый продуктовый скилл ради правил, затем процесс
проектируется заново через `change-workflow`.
