---
status: draft
---

# Предметная область (MVP)

Сущности, связи, статусы и правила MVP. Источник для продуктовых скиллов `lms*`. Колонки — целевые; фактические
— в `apps/api/src/modules/*/schema.ts` и `packages/blocks/src/*/table.ts` (при расхождении правится этот документ в
той же задаче).

Модель **реляционная** (D-032): структура — таблицы, колонки, FK, enum. JSONB — только непрозрачные данные: тело
форматированного текста (тип `rich` ниже), `audit_log.diff`, payload вебхуков; события в доставке — данные задач pg-boss (D-045).

Общие колонки тенантной таблицы (добавляет `tenantTable`): `id uuid default uuidv7()`, `school_id`, `created_at`,
`updated_at`; связи между тенантными таблицами — составные FK `(school_id, x_id)` (D-038). Тип `rich` — документ Tiptap в колонке `richText()` (скилл `rich-text`).

## 1. Модули и сущности

### Школа и участники (`schools`, ядро)

| Таблица                                                         | Колонки                                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `schools`                                                       | `slug`, `name`, `status` (`active`, `suspended`, `deleted`), `deletion_requested_at`, `timezone`, `locale` |
| `school_branding`                                               | `school_id` PK, `logo_file_id`, `favicon_file_id`, `primary_color`, `support_email`                        |
| `school_domains`                                                | `school_id`, `host`, `kind` (`old_slug`, `custom`), `redirect_until`                                       |
| `members`                                                       | `user_id`, `role`, `status` (`invited`, `active`, `blocked`), `invited_by`, `joined_at`, `avatar_file_id` |
| `users`, `sessions`, `accounts`, `verifications`, `invitations` | better-auth (ядро); `users.platform_role` (`operator` или null)                                            |
| `<module>_settings`                                             | настройки школы модуля, PK `school_id`, типизированные колонки (D-036)                                     |

### Курсы и контент (`courses`)

| Таблица         | Колонки                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `courses`       | `title`, `slug`, `description rich`, `cover_file_id`, `status` (`draft`, `published`, `archived`), `default_access_mode`, `access_days`, `completion_threshold_pct`                                                                                                                                                                                                                                                                                                                                                                   |
| `sections`      | `course_id`, `title`, `position`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `lessons`       | `section_id`, `course_id`, `title`, `position`, `published_at`, `has_unpublished_changes`, `access_mode` (`inherit`, `open`, `sequential`, `drip`), `drip_days`, `drip_date`, `completion_rule` (`view`, `all_blocks`, `manual`)                                                                                                                                                                                                                                                                                                      |
| `lesson_blocks` | `lesson_id`, `block_key uuid` (стабилен между черновиком и публикацией), `state` (`draft`, `published`), `type`, `position`, `is_required`; уникально `(lesson_id, state, block_key)` (D-033)                                                                                                                                                                                                                                                                                                                                         |
| `block_<type>`  | данные типа блока, PK = FK `block_id → lesson_blocks.id on delete cascade` (+ `school_id`, RLS); дочерние таблицы типа — `block_<type>_<часть>` (D-034). MVP: `block_text (body rich)`, `block_heading (text, level)`, `block_image (file_id, caption, width)`, `block_video (source, provider, video_id, url, caption)`, `block_file (file_id, title)`, `block_embed (url, host, height)`, `block_callout (tone, body rich)`, `block_divider`, `block_code (language, code)`, `block_quiz` (см. ниже), `block_assignment` (см. ниже) |

### Тесты и задания (`assessments`)

| Таблица                               | Колонки                                                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `questions`                           | `course_id`, `type`, `prompt rich`, `explanation rich`, `points`, `scoring` (`all_or_nothing`, `partial`), `case_sensitive`, `number_answer`, `number_tolerance`, `revision_of` (ревизия, D-035), `is_current`, `archived_at`                      |
| `question_items`                      | `question_id`, `kind` (`option`, `order_item`, `match_left`, `match_right`, `accepted_text`), `body rich` или `text`, `position`, `is_correct`, `correct_position`, `match_key`                                                                    |
| `question_tags`, `question_tag_links` | теги банка курса: `course_id`, `label` (в API `name`); связь `question_id` ↔ `tag_id`                                                                                                                                                                              |
| `block_quiz`                          | `block_id` PK, `selection` (`fixed`, `random_by_tags`), `random_count`, `attempts_limit` (0 = без ограничений), `pass_score_pct`, `time_limit_sec`, `shuffle_questions`, `shuffle_options`, `show_correct` (`never`, `after_submit`, `after_pass`) |
| `block_quiz_questions`                | `block_id`, `question_id` (для `fixed`), `position`                                                                                                                                                                                                |
| `block_quiz_tags`                     | `block_id`, `tag_id` (для `random_by_tags`)                                                                                                                                                                                                        |
| `quiz_attempts`                       | `enrollment_id`, `lesson_id`, `block_key`, `status` (`in_progress`, `submitted`, `graded`), `score`, `max_score`, `passed`, `started_at`, `deadline_at`, `submitted_at`, `graded_at`                                                               |
| `attempt_questions`                   | снимок: `attempt_id`, `question_id` (конкретная ревизия), `position`, `points`                                                                                                                                                                     |
| `attempt_question_items`              | порядок вариантов в попытке: `attempt_question_id`, `item_id`, `position`                                                                                                                                                                          |
| `quiz_answers`                        | `attempt_question_id`, `text_value`, `number_value`, `score`, `is_correct`, `graded_by`, `feedback rich`                                                                                                                                           |
| `quiz_answer_items`                   | выбранное/порядок/пары: `answer_id`, `item_id`, `position`, `matched_item_id`                                                                                                                                                                      |
| `block_assignment`                    | `block_id` PK, `prompt rich`, `allow_text`, `allow_files`, `max_files`, `requires_review`                                                                                                                                                          |
| `submissions`                         | `enrollment_id`, `lesson_id`, `block_key`, `status`, `body rich`, `grade`, `reviewer_member_id`, `submitted_at`, `reviewed_at`                                                                                                                     |
| `submission_files`                    | `submission_id`, `file_id`, `position`                                                                                                                                                                                                             |
| `submission_comments`                 | `submission_id`, `author_member_id`, `body rich`; файлы — `submission_comment_files`                                                                                                                                                               |

### Обучение (`learning`)

| Таблица                  | Колонки                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups`                 | поток: `course_id`, `title`, `starts_at`, `ends_at`, `access_days`                                                                                                                                |
| `group_curators`         | `group_id`, `member_id`                                                                                                                                                                           |
| `enrollments`            | `member_id`, `course_id`, `group_id?`, `status` (`active`, `completed`, `expired`, `revoked`), `source` (`manual`, `invite`, `link`), `enrolled_at`, `expires_at`, `completed_at`, `progress_pct` |
| `lesson_progress`        | `enrollment_id`, `lesson_id`, `status` (`locked`, `available`, `in_progress`, `completed`), `available_at`, `opened_at`, `completed_at`                                                           |
| `block_progress`         | `enrollment_id`, `lesson_id`, `block_key`, `status` (`not_started`, `done`, `graded`, `failed`), `score`, `max_score`, `completed_at`                                                             |
| `block_<type>_responses` | ответ ученика интерактивного блока (если тип хранит ответ): `enrollment_id`, `block_key`, колонки ответа                                                                                          |
| `deadlines`              | `course_id`, `group_id?`, `lesson_id`, `due_at` или `due_days` от начала                                                                                                                          |
| `enrollment_invites`     | ссылки-приглашения курса: `course_id`, `group_id?`, `token`, `expires_at`, `max_uses`, `uses`                                                                                                     |

### Сертификаты (`certificates`)

| Таблица                 | Колонки                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `certificate_templates` | `course_id`, `title`, `orientation`, `background_file_id`, `heading`, `body rich`, `signer_name`, `signer_title`, `signature_file_id`, `show_number`, `show_date` |
| `certificates`          | `enrollment_id`, `template_id`, `number`, `issued_at`, `file_id`; `certificate_counters` (`school_id`, `year`, `last_number`)                                     |

### Ядро

| Таблица          | Колонки                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`          | `key` в S3, `purpose`, `name`, `mime`, `size`, `owner_member_id` (без FK — цикл с `members.avatar_file_id`), `status` (`pending`, `ready`)     |
| `file_variants`  | `file_id`, `variant`, `key`, `width`, `height`                                                                                                |
| `audit_log`      | `actor_member_id`, `actor_operator_id?`, `action`, `entity`, `entity_id`, `diff jsonb` (непрозрачный), `ip`, `created_at` — только добавление |
| `consents`       | `user_id`, `school_id?`, `kind` (`offer`, `privacy`, `pd_processing`, `marketing`), `version`, `ip`, `created_at`                             |
| `webhook_events` | `provider`, `external_id` (уникален), `payload jsonb` (непрозрачный), `status`, `processed_at`                                                |

## 2. Роли

| Роль      | Кто                 | Область | Коротко                                                |
| --------- | ------------------- | ------- | ------------------------------------------------------ |
| `owner`   | владелец школы      | `admin` | всё, включая настройки, удаление школы, тариф          |
| `admin`   | администратор       | `admin` | всё, кроме удаления школы и тарифа                     |
| `teacher` | автор/преподаватель | `admin` | курсы и контент, банк вопросов, проверка ДЗ всех групп |
| `curator` | куратор             | `admin` | проверка ДЗ и прогресс **только своих групп**          |
| `student` | ученик              | `learn` | свои курсы, прохождение, свои попытки и ДЗ             |

Одна роль на членство. Разрешения по ролям — в `permissions.ts` модулей (скилл `permissions`). Названия ролей и
термины школа не меняет (D-028).

**Оператор SaaS** — не роль школы, а глобальный признак `users.platform_role = 'operator'` (D-026): доступ к
области `/ops` (все школы), приостановка школ, вход от имени участника — только с записью в `audit_log` и баннером
«Вы вошли как …». Оператор не видит данные школы вне сессии «от имени».

## 3. Правила

### Курс и публикация

- Курс создаёт сотрудник с `courses.manage`; новый курс — `draft`. Курс в `draft` не виден ученикам. `published` —
  виден зачисленным. `archived` — новые зачисления запрещены, у зачисленных доступ сохраняется до `expires_at`.
- Адрес курса `slug` — латиница, цифры, дефис, 3–60 символов, уникален в школе; при создании — из названия
  транслитом (занятый — с номером: `-2`, `-3`), меняется только у черновика (у опубликованного он уже у учеников).
- **Удалить** можно только черновик без уроков (иначе `COURSE_NOT_EMPTY` / `COURSE_NOT_DRAFT`); остальное —
  **«В архив»**. Архивация, удаление курса, удаление раздела и урока пишутся в журнал действий.
- Порядок: разделы в курсе и уроки в разделе — `position` (шаг 1000, перестановка — перенумерация соседей); урок —
  ровно в одном разделе своего курса (перенос в раздел другого курса — `LESSON_MOVE_OTHER_COURSE`). Раздел
  удаляется вместе с уроками, урок — вместе с блоками (черновик и публикация).
- Права (`courses`): `courses.read` — все сотрудники; `courses.manage`, `courses.publish` — owner, admin, teacher;
  куратор курсы видит, но не правит.
- Преподаватель правит блоки со `state = draft` (D-033); `lessons.has_unpublished_changes` = есть отличия.
  «Опубликовать урок» одной транзакцией удаляет `published`-строки урока (каскадом — их `block_<type>`) и копирует
  `draft`-строки в `published` с теми же `block_key`; ставит `published_at`, снимает `has_unpublished_changes`,
  событие `lesson.published`. Ученик читает только `published` через `toPublic()`.
- Урок не публикуется, если в черновике есть **незаполненные блоки** (замечания типа блока — `issues` в
  `defineBlock`: нет ссылки, пустой текст…) — `LESSON_HAS_ISSUES` со списком, или блоков нет совсем —
  `LESSON_EMPTY`. Повтор без изменений — без события.
- Статус урока для сотрудников вычисляется: «Черновик» (`published_at` пуст), «Опубликован», «Есть изменения»
  (`has_unpublished_changes`). Название, порядок и настройки урока не версионируются — меняются у учеников сразу.
- **Публикация курса** (`courses.publish`): `draft` → `published`, если в курсе есть хотя бы один опубликованный урок
  (`COURSE_NO_PUBLISHED_LESSONS`); пишется в журнал, событие `course.published`. Обратно в черновик нельзя — только
  «В архив»; архивный курс не публикуется (`COURSE_ARCHIVED`), но уроки в нём публиковать можно.
- **Обложка курса** — картинка школы (назначение `courses.cover`, JPEG/PNG/WebP до 5 МБ), меняет `courses.manage`;
  замена или «Убрать» удаляет прежний файл.
- **Видео урока** — блок «Видео»: ссылка из белого списка или загруженный файл (MP4, MOV, WebM, MKV до 2 ГБ). Загрузка идёт провайдеру напрямую; блок хранит `provider`, `video_id`, `status` (`processing` → `ready`/`failed`), их пишет только сервер. Урок с видео не в статусе `ready` не публикуется; ученику уходит адрес плеера (D-056).
- **Медиа урока** — файлы школы: картинки (`courses.lesson-image`: блок «Картинка» и картинки в тексте; JPEG, PNG,
  WebP, GIF до 10 МБ) и файлы (`courses.lesson-file`: блок «Файл»; PDF, Word, Excel, PowerPoint, ZIP, TXT, CSV, MP3
  до 100 МБ). Блок хранит `file_id`; привязать можно только готовый файл своего назначения, загруженный этим
  участником (`FILE_INVALID`). Ссылки — подписанные, на 6 ч, рядом с данными блока. Удалённые из урока файлы из
  хранилища пока не удаляются (на них может ссылаться опубликованная версия; очистка — отдельной задачей).
- **«Опубликовать изменения»** в конструкторе курса — все уроки со статусом «Черновик» и «Есть изменения» одной
  транзакцией; хотя бы у одного замечания — не публикуется ни один (`COURSE_LESSONS_HAVE_ISSUES` со списком уроков).
- Ответы учеников (`block_progress`, попытки, сдачи) ссылаются на `(lesson_id, block_key)` — переживают повторные
  публикации. Удалить блок, на который есть ответы (тест, задание), — только с подтверждением; ответы сохраняются,
  блок пропадает из плеера (проверка появится вместе с ответами — фаза 3).

### Доступ к урокам (`lessons.access_mode`)

- `open` (всегда) | `sequential` (после завершения предыдущего урока) | `drip` (через `drip_days` после начала
  потока/зачисления или с `drip_date`) | `inherit` (режим курса `courses.default_access_mode`).
- Статус `lesson_progress.status` вычисляется сервисом `learning` и пересчитывается по событиям
  `lesson.completed`, `enrollment.created`, по расписанию (drip).

- **Плеер ученика (2.6, D-057).** Ученик видит курсы, на которые зачислен (`enrollments`: `active`/`completed`/`expired`),
  кроме черновиков; архивный курс у зачисленных открыт. Урок виден только опубликованный (`published_at`); блоки — только
  опубликованные строки через `toPublic`. Доступность считается при чтении: `sequential` — предыдущий опубликованный урок
  курса (разделы, затем уроки) завершён; `drip` — наступили `drip_date` или `enrolled_at + drip_days`; `inherit` — режим
  курса. Закрытый урок виден в оглавлении с причиной, открыть его нельзя (`LESSON_LOCKED`); чужой, неопубликованный или без
  зачисления — `LESSON_NOT_FOUND`. `expires_at` в прошлом — «доступ закончился» (`ENROLLMENT_EXPIRED`), оглавление не
  отдаётся. Зачисление в 2.6 — только внутренняя `enrollMember` (идемпотентна; курс опубликован; `expires_at` из
  `courses.access_days`); экраны и API — фаза 4.

### Завершение урока (`lessons.completion_rule`)

- `view` (открыл) | `all_blocks` (все блоки `is_required` выполнены) | `manual` (кнопка «Завершить»).
- Блок задаёт свой вид завершения (`completion` в `defineBlock`): `none`, `view`, `interaction`, `grade`
  (тест пройден на ≥ `pass_score_pct`, задание принято); факт — `block_progress`.
- Прогресс курса `progress_pct` = завершённые уроки / опубликованные уроки; при `progress_pct ≥ completion_threshold_pct`
  зачисление становится `completed` (`recalcProgress`, событие `enrollment.completed`). В 2.6: `view` завершает урок при
  открытии (`learn.lessons.open`), `manual` — «Завершить урок» (`learn.lessons.complete`), `all_blocks` = `view` до блоков с
  ответами (фаза 3); событие `lesson.completed` — один раз на урок.

### Банк вопросов (модуль `assessments`, 3.1)

- Банк принадлежит курсу; вопрос — один из типов реестра (`@dinastia/questions`), правила типа проверяет сервер схемой
  типа. Список — текущие ревизии без архивных; поиск — по тексту вопроса (не по служебным ключам документа), фильтры —
  тип и тег, сортировка — изменён, создан, баллы.
- **Теги** — свободные метки курса: создаются по имени при сохранении вопроса, регистр не важен (`Алгебра` = `алгебра`),
  имя 1–40 символов, до 10 на вопрос. Колонка `question_tags.label` (в API — `name`): имена `name` реестр проверок
  считает возможными ПДн. Переименование (занятое имя — `TAG_EXISTS`) и удаление тега (связи снимаются, вопросы остаются).
- «В архив» убирает вопрос из банка (прошлые попытки сохраняют его); вернуть нельзя; удалить насовсем нельзя. До
  появления попыток (3.3) вопрос правится на месте; с ответами — ревизия (`reviseQuestion`, D-035), теги копируются.
- Права: `assessments.bank.read` — owner, admin, teacher, curator; `assessments.bank.manage` — owner, admin, teacher.
  Верные ответы видят только сотрудники с чтением банка; ученику — `toPublic` в попытке (3.3).
- В банк не попадают пустая формулировка и пустые варианты: схема типа их допускает (заготовка редактора проходит схему),
  экран вопроса не даёт сохранить.

### Типы вопросов (3.2)

- Общие правила: баллы 1–100; формулировка обязательна, пустая формулировка и пустые варианты, элементы, пары — ошибка схемы
  (`PROMPT_REQUIRED`, `OPTION_REQUIRED`, `ITEM_REQUIRED`); пояснение необязательно; ученику — `toPublic` без верных ответов.
- `single_choice` — один верный вариант из 2–20. `multiple_choice` — 2–20 вариантов, ≥1 верный и ≥1 неверный; режим `scoring`:
  «всё или ничего» либо частичный балл `баллы × max(0, (верно выбранные − лишние) / всего верных)`.
- `text_input` — допустимые ответы (1–20, до 200 символов), регистр по настройке; нормализация: пробелы по краям убраны,
  подряд идущие схлопнуты, `ё` = `е`; в допустимом ответе `*` — любая последовательность, `?` — один символ (без
  регулярных выражений); пустой ответ неверен. Частичного балла нет.
- `number` — верное число и абсолютный допуск (≥ 0; 0 — точное совпадение); ввод с запятой или точкой; частичного балла нет.
- `ordering` — 2–10 элементов, верный порядок задаёт автор; `partial` — доля элементов на своих местах; ученику порядок
  элементов отдаётся детерминированно перемешанным (по хэшу id), позиции не раскрываются.
- `matching` — 2–10 пар «левое — правое», лишних правых нет; `partial` — доля верных пар; правые части отдельным
  перемешанным списком без ключей пар.
- `open_text` — ответ текстом до 5000 символов, проверяет человек (3.6): автоматической оценки нет, образец ответа — в
  «пояснении», ученику виден только в разборе.

### Тест (блок `quiz`)

- Настройки — `block_quiz` (по умолчанию: фиксированный список, попыток без ограничения, проходной 60 %, без таймера, без
  перемешивания, ответы показываются после сдачи); вопросы — фиксированный список `block_quiz_questions` (до 50, порядок
  автора) или `random_count` случайных на попытку из банка с **любым** из тегов `block_quiz_tags`. Вопрос, заменённый
  ревизией, подменяется текущей, архивные пропускаются; не осталось ни одного — `QUIZ_EMPTY`; пул меньше числа — берутся все.
- Права: проходит ученик (`assessments.attempt`), только свои попытки; урок должен быть открыт (`LESSON_LOCKED`).
- Попытка: `in_progress → submitted | graded`. Старт под блокировкой зачисления; есть активная — возвращается она; лимит
  считает все начатые попытки (`ATTEMPTS_EXHAUSTED`). Ответ сохраняется сразу (`quiz_answers`, `quiz_answer_items`;
  форма ответа типа ↔ строки — по ключам `selected`, `order`, `pairs`, `text`, `value`); `null` снимает ответ.
- Перемешивание: «вопросы» — порядок вопросов; «варианты» — порядок вариантов `option`; элементы `order_item` и
  `match_right` перемешиваются всегда (порядок хранения — это ответ); порядок фиксируется в `attempt_question_items`.
- Таймер — серверный: `deadline_at = started_at + time_limit_sec`; ответ после срока — `ATTEMPT_EXPIRED`; сдача после
  срока оценивает сохранённое; просроченную попытку сдаёт обращение к тесту или задача `assessments.expire-attempts`
  (раз в минуту).
- Сдача: каждый вопрос проверяется `gradeAnswer`, неотвеченный — 0; `passed = score/max ≥ pass_score_pct` (фиксируется при
  сдаче, смена порога прошлые попытки не пересчитывает); есть `open_text` — `submitted`, `passed` пусто до ручной проверки
  (3.6). События `quiz.submitted` (всегда), `quiz.graded` (когда `passed` известен).
- Показ ответов (`show_correct`): `never` — только итог; `after_submit` — по каждому вопросу ответ, верно/неверно, верный
  ответ и пояснение; `after_pass` — то же, только сдавшему.
- Правка вопроса банка, который есть в снимке хотя бы одной попытки, — новая ревизия (`reviseQuestion`, D-035): прежняя
  остаётся в попытках, теги копируются, в ответе API новый id.
- Завершение урока по результату теста (`completion: grade`) — 3.6; пока урок завершается по своему правилу (`view`/`manual`).
- Старт попытки: проверка `attempts_limit` под блокировкой, снимок — строки `attempt_questions` (конкретные
  ревизии вопросов) и `attempt_question_items` (порядок вариантов). Правка вопроса после этого создаёт новую ревизию
  (D-035) и не меняет попытку.
- Оценивание — на сервере через `grade()` типа вопроса по `quiz_answers`/`quiz_answer_items`; открытые вопросы
  (`open_text`) переводят попытку в `submitted` до ручной проверки.

### Домашнее задание (блок `assignment`)

- Статусы `submissions.status`: `draft → submitted → (needs_revision → submitted)* → accepted | rejected`.
- Проверяет: преподаватель — любые; куратор — только своих групп. После `accepted` блок считается выполненным.

### Зачисление

- Способы MVP: вручную сотрудником, по приглашению (email → magic link), по ссылке-приглашению курса.
- При зачислении создаётся `members` с ролью `student` (если нет), `enrollments`, `lesson_progress` для уроков курса.
- Срок доступа: `groups.access_days` или `courses.access_days`; истечение — задача `learning.expire-enrollments`.

### Сертификат

- Выдаётся при `enrollment.completed`, если у курса есть шаблон; номер — `<slug школы>-<год>-<порядковый>`
  (счётчик `certificate_counters` под блокировкой).

## 4. События (MVP)

| Событие                                        | Когда                         | Данные                                 |
| ---------------------------------------------- | ----------------------------- | -------------------------------------- |
| `course.published`                             | курс опубликован              | `courseId`                             |
| `lesson.published`                             | урок опубликован              | `lessonId`, `courseId`                 |
| `enrollment.created`                           | ученик зачислен               | `enrollmentId`, `courseId`, `memberId` |
| `lesson.opened` / `lesson.completed`           | ученик открыл / завершил урок | `enrollmentId`, `lessonId`             |
| `quiz.submitted` / `quiz.graded`               | попытка отправлена / оценена  | `attemptId`, `passed`                  |
| `submission.submitted` / `submission.reviewed` | ДЗ отправлено / проверено     | `submissionId`, `status`               |
| `enrollment.completed`                         | курс пройден                  | `enrollmentId`                         |

Эти же события — триггеры автоматизаций после MVP.
