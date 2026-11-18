# Dinastia на Windows вручную (Docker, как у разработчика)

Запасной путь к [windows.md](windows.md): без инсталлятора, из исходников, так же, как платформа запускается у
разработчика (скилл `local-env`). Нужны интернет и права администратора. Результат такой же: учебный центр АИР «Горизонт»
с курсом по первой помощи на `http://airgorizont.education.localhost:5173`, пароль у всех `gorizont2026`.

Время — около часа, из него большая часть уходит на скачивание и одну перезагрузку.

## 1. Требования

| Что | Минимум |
| --- | --- |
| Windows | 10 22H2 или 11, x64 |
| Память | 8 ГБ (Docker Desktop и платформа вместе) |
| Диск | 20 ГБ свободно |
| Процессор | виртуализация включена в BIOS/UEFI (Intel VT-x / AMD-V). Проверка: Диспетчер задач → Производительность → ЦП → «Виртуализация: Включено» |
| Права | администратор (ставятся программы и WSL) |

## 2. Программы (один раз)

Всё ставится из **PowerShell от имени администратора** (Пуск → PowerShell → правой кнопкой → «Запуск от имени
администратора»). `winget` уже есть в Windows 10/11; если его нет — скачать установщики с сайтов по ссылкам.

1. **WSL 2** — нужен Docker Desktop:
   ```powershell
   wsl --install --no-distribution
   ```
   **Перезагрузить компьютер.**

2. **Docker Desktop** (https://www.docker.com/products/docker-desktop/):
   ```powershell
   winget install -e --id Docker.DockerDesktop
   ```
   Запустить Docker Desktop, принять соглашение, дождаться «Engine running» (зелёный значок внизу слева). В настройках
   включено **Use the WSL 2 based engine** (по умолчанию).

3. **Git** (https://git-scm.com/download/win):
   ```powershell
   winget install -e --id Git.Git
   ```

4. **Node.js 24** (https://nodejs.org — версия 24.x, установщик `.msi`):
   ```powershell
   winget install -e --id OpenJS.NodeJS --version 24.22.3
   ```
   Если `winget` не находит эту версию — скачать `node-v24.x.x-x64.msi` с https://nodejs.org/dist/latest-v24.x/.

5. **Закрыть PowerShell и открыть заново** (обычный, не администратор), проверить:
   ```powershell
   git --version
   node --version    # v24.x
   docker --version
   ```

6. **pnpm** через corepack (идёт с Node):
   ```powershell
   corepack enable
   ```
   Если ругается на права — один раз в PowerShell от администратора, затем снова обычный.

## 3. Код платформы

Папка — **только латиницей и без пробелов**, например `C:\dinastia`.

```powershell
cd C:\
git clone -c core.autocrlf=false https://github.com/dimasio/dinastia.git
cd C:\dinastia
```

> `core.autocrlf=false` **обязателен**: иначе Git для Windows перепишет переводы строк в скриптах для контейнеров
> (`docker/postgres/init.sh`), и база не создастся — ошибка вида `/bin/sh^M: bad interpreter`.

Без интернета на целевом компьютере — склонировать на другом компьютере тем же способом и перенести папку на флешке
**без** `node_modules` (её ставит шаг 4, ему всё равно нужен интернет).

## 4. Первый запуск

В PowerShell в папке `C:\dinastia` (Docker Desktop запущен):

```powershell
copy .env.example .env
pnpm install
pnpm exec playwright install chromium
pnpm env:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| Команда | Что делает |
| --- | --- |
| `copy .env.example .env` | настройки для локального запуска (порты, адреса, ключи — подходят как есть) |
| `pnpm install` | зависимости (несколько минут) |
| `pnpm exec playwright install chromium` | Chromium для PDF удостоверений |
| `pnpm env:up` | контейнеры: PostgreSQL, хранилище файлов SeaweedFS, почта Mailpit (первый раз — скачивание образов) |
| `pnpm db:migrate` | таблицы базы |
| `pnpm db:seed` | учебный центр АИР «Горизонт», курс, пользователи — в конце печатает логины |
| `pnpm dev` | платформа: API на :3000 и веб на :5173. **Окно не закрывать** — пока оно открыто, платформа работает |

Windows может спросить про доступ `node.exe` к сети — «Разрешить» (частные сети).

Проверка окружения, если что-то не так: `pnpm env:check` — покажет, чего не хватает, и команду исправления.

## 5. Адреса и логины

Открывать в **Chrome или Edge** (они сами понимают адреса `*.localhost`):

| Что | Адрес |
| --- | --- |
| учебный центр | http://airgorizont.education.localhost:5173 |
| консоль оператора | http://education.localhost:5173/ops |
| почта (все письма платформы) | http://localhost:8025 |

| Роль | Почта (пароль `gorizont2026`) |
| --- | --- |
| владелец | `kornev@airgorizont.local` |
| администратор | `tikhomirov@airgorizont.local` |
| куратор | `ivanov@airgorizont.local` |
| слушатель | `tikhomirova@airgorizont.local` |
| оператор `/ops` | `ops@airgorizont.local` (второй фактор — при первом входе) |

## 6. Каждый день

| Действие | Как |
| --- | --- |
| запустить | Docker Desktop → `cd C:\dinastia` → `pnpm env:up` → `pnpm dev` |
| остановить | в окне `pnpm dev` — `Ctrl+C`, затем `pnpm env:down` (данные сохраняются) |
| обновить до новой версии | остановить → `git pull` → `pnpm install` → `pnpm env:up` → `pnpm db:migrate` → `pnpm dev` |
| сбросить демо-данные | остановить `pnpm dev` → `pnpm db:reset` → `pnpm db:seed` → `pnpm dev` |
| всё с нуля (база, файлы, письма) | остановить → `pnpm env:reset` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev` |

## 7. Если не работает

| Признак | Причина и что делать |
| --- | --- |
| `docker: command not found` / «Docker Desktop is starting» | Docker Desktop не запущен или ещё стартует — дождаться «Engine running» |
| Docker Desktop: «WSL 2 installation is incomplete» / «Virtualization not enabled» | `wsl --update` от администратора; включить виртуализацию в BIOS |
| `pnpm env:up`: порт 5432 (8333, 1025, 8025) занят | на компьютере уже есть PostgreSQL или другая программа — остановить её службу или поменять порт в `.env` (`DB_PORT=5433` и тот же порт в `DATABASE_URL*`) |
| база не создаётся, в `pnpm env:logs` — `^M` или `bad interpreter` | код склонирован без `core.autocrlf=false` — удалить папку, клонировать заново (шаг 3), затем `pnpm env:reset` |
| `pnpm` не найден | `corepack enable` и новое окно PowerShell |
| `pnpm db:reset` отказывается: «подключено ещё N» | запущен `pnpm dev` — остановить его (`Ctrl+C`), повторить |
| сайт не открывается по `airgorizont.education.localhost` | открыть в Chrome или Edge; Firefox и старые браузеры могут не понимать `*.localhost` |
| нет PDF удостоверения | не выполнен `pnpm exec playwright install chromium` — выполнить и перезапустить `pnpm dev` |
| ошибка «Queue … does not exist» после сброса | базу сбросили под запущенным `pnpm dev` — перезапустить `pnpm dev` |

Логи: окно `pnpm dev` (API и воркер), контейнеры — `pnpm env:logs`.
