"""Лаунчер Dinastia для Windows (D-069, docs/guide/windows.md).

Запускает службы платформы из папки установки — PostgreSQL, SeaweedFS (S3), Mailpit (почта), API, воркер задач и шлюз —
и открывает учебный центр в отдельном окне (WebView2). Закрытие окна останавливает службы. Данные — в папке `data`
установки (по умолчанию C:\\Dinastia\\data): база, файлы, письма, логи, конфигурация с паролями и портами. Путь — только
латиницей: PostgreSQL на Windows не дружит с кириллицей в путях (поэтому не профиль пользователя).

Режимы:
  Dinastia.exe              окно учебного центра
  Dinastia.exe --setup      первая установка или обновление: база, роли, бакет, миграции, демо-данные (вызывает инсталлятор)
  Dinastia.exe --selftest   установка, запуск, проверки (вход слушателя, PDF через Chromium), остановка — для CI
  Dinastia.exe --stop       остановить службы этой установки (инсталлятор — перед обновлением и удалением)
"""

from __future__ import annotations

import argparse
import ctypes
import json
import logging
import os
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

DOMAIN = "education.localhost"
CENTER = "airgorizont"
CENTER_NAME = "АИР «Горизонт»"
TITLE = "Dinastia — учебный центр"

IS_WIN = sys.platform == "win32"
FROZEN = getattr(sys, "frozen", False)
# папка установки: рядом с Dinastia.exe; из исходников — out/windows/stage (собирает tools/windows/build.ps1)
BASE = Path(sys.executable).parent if FROZEN else Path(__file__).resolve().parents[3] / "out" / "windows" / "stage"
BASE = Path(os.environ.get("DINASTIA_HOME", BASE))
DATA = Path(os.environ.get("DINASTIA_DATA", BASE / "data"))

EXE = ".exe" if IS_WIN else ""
NODE = BASE / "runtime" / "node" / f"node{EXE}"
PG_BIN = BASE / "runtime" / "pgsql" / "bin"
WEED = BASE / "runtime" / "weed" / f"weed{EXE}"
MAILPIT = BASE / "runtime" / "mailpit" / f"mailpit{EXE}"
BROWSERS = BASE / "runtime" / "browsers"
APP = BASE / "app"

PG_DATA = DATA / "pg"
S3_DATA = DATA / "s3"
MAIL_DATA = DATA / "mail"
LOGS = DATA / "logs"
CONFIG = DATA / "config.json"
ACCOUNTS = DATA / "accounts.txt"

CREATE_NO_WINDOW = 0x08000000
NEW_GROUP = 0x00000200

log = logging.getLogger("dinastia")


# ---------------------------------------------------------------- конфигурация


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def pick_port(candidates: list[int], taken: set[int], extra_offset: int = 0) -> int:
    """Первый свободный порт из кандидатов (и порт + extra_offset — gRPC у SeaweedFS), иначе следующий свободный."""
    seq = list(candidates) + list(range(candidates[-1] + 1, candidates[-1] + 200))
    for port in seq:
        pair = [port] + ([port + extra_offset] if extra_offset else [])
        if any(p in taken for p in pair):
            continue
        if all(port_free(p) for p in pair):
            taken.update(pair)
            return port
    raise RuntimeError(f"не нашлось свободного порта рядом с {candidates[0]}")


def new_config() -> dict:
    taken: set[int] = set()
    ports = {
        # веб: 80 — адрес без порта; занят (IIS, другие программы) — 8080 и дальше
        "web": pick_port([80, 8080, 8090, 8800], taken),
        "api": pick_port([13000], taken),
        "pg": pick_port([15432], taken),
        "s3": pick_port([18333], taken, 10000),
        "weedMaster": pick_port([19333], taken, 10000),
        "weedVolume": pick_port([18081], taken, 10000),
        "weedFiler": pick_port([18889], taken, 10000),
        "smtp": pick_port([11025], taken),
        "mail": pick_port([18025], taken),
    }
    return {
        "ports": ports,
        "secrets": {
            "pgSuper": secrets.token_hex(16),
            "appOwner": secrets.token_hex(16),
            "appUser": secrets.token_hex(16),
            "auth": secrets.token_hex(32),
            "s3Access": "dinastia",
            "s3Secret": secrets.token_hex(16),
        },
        "dbReady": False,
        "setupDone": False,
    }


def load_config() -> dict | None:
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def save_config(cfg: dict) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CONFIG)


def version() -> str:
    try:
        v = json.loads((APP / "version.json").read_text(encoding="utf-8"))
        return " ".join(x for x in (v.get("release"), v.get("commit")) if x)
    except (OSError, ValueError):
        return "dev"


def web_origin(cfg: dict, slug: str | None = None) -> str:
    port = cfg["ports"]["web"]
    host = f"{slug}.{DOMAIN}" if slug else DOMAIN
    return f"http://{host}" + ("" if port == 80 else f":{port}")


# ---------------------------------------------------------------- процессы


class Job:
    """Job Object Windows: дочерние процессы (node, weed, mailpit, Chromium) завершаются вместе с лаунчером, даже аварийно."""

    def __init__(self) -> None:
        self.handle = None
        if not IS_WIN:
            return
        from ctypes import wintypes

        class IoCounters(ctypes.Structure):
            _fields_ = [
                (n, ctypes.c_ulonglong)
                for n in ("Read", "Write", "Other", "ReadTransfer", "WriteTransfer", "OtherTransfer")
            ]

        class BasicLimit(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_int64),
                ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wintypes.DWORD),
                ("SchedulingClass", wintypes.DWORD),
            ]

        class ExtendedLimit(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", BasicLimit),
                ("IoInfo", IoCounters),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        k32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.k32 = k32
        self.handle = k32.CreateJobObjectW(None, None)
        info = ExtendedLimit()
        info.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        k32.SetInformationJobObject(self.handle, 9, ctypes.byref(info), ctypes.sizeof(info))

    def add(self, proc: subprocess.Popen) -> None:
        if self.handle:
            self.k32.AssignProcessToJobObject(self.handle, int(proc._handle))  # type: ignore[attr-defined]


def run(args: list, env: dict | None = None, cwd: Path | None = None, input_text: str | None = None, check=True):
    """Короткая команда без окна консоли; вывод — в лог лаунчера."""
    log.info("$ %s", " ".join(str(a) for a in args))
    res = subprocess.run(
        [str(a) for a in args],
        env=env,
        cwd=cwd,
        input=input_text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=CREATE_NO_WINDOW if IS_WIN else 0,
    )
    out = (res.stdout or "") + (res.stderr or "")
    if out.strip():
        log.info(out.strip()[-4000:])
    if check and res.returncode != 0:
        raise RuntimeError(f"{Path(str(args[0])).name}: код {res.returncode}\n{out.strip()[-1500:]}")
    return res


def http_ok(url: str, host: str | None = None, timeout: float = 3) -> bool:
    req = urllib.request.Request(url, headers={"Host": host} if host else {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return 200 <= r.status < 400
    except (urllib.error.URLError, OSError, ValueError):
        return False


def wait_until(check, what: str, timeout: float, proc: subprocess.Popen | None = None, log_file: Path | None = None):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        if proc is not None and proc.poll() is not None:
            raise RuntimeError(f"{what}: процесс завершился (код {proc.returncode})" + tail(log_file))
        time.sleep(0.4)
    raise RuntimeError(f"{what}: не ответил за {int(timeout)} с" + tail(log_file))


def tail(path: Path | None, lines: int = 15) -> str:
    if not path or not path.exists():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]
    return "\n" + "\n".join(text)


class Services:
    def __init__(self, cfg: dict) -> None:
        self.cfg = cfg
        self.p = cfg["ports"]
        self.s = cfg["secrets"]
        self.job = Job()
        self.procs: dict[str, subprocess.Popen] = {}
        LOGS.mkdir(parents=True, exist_ok=True)

    # --- окружение node

    def node_env(self) -> dict:
        p, s = self.p, self.s
        env = {k: v for k, v in os.environ.items() if not k.startswith(("DATABASE_", "S3_", "SMTP_", "APP_"))}
        env.update(
            {
                # демо-режим как локальная разработка (D-069): видео — заглушка, письма — в Mailpit; не production
                "NODE_ENV": "development",
                "LOG_FORMAT": "json",
                "API_HOST": "127.0.0.1",
                "API_PORT": str(p["api"]),
                "DATABASE_URL": f"postgres://app_user:{s['appUser']}@127.0.0.1:{p['pg']}/dinastia",
                "DATABASE_URL_OWNER": f"postgres://app_owner:{s['appOwner']}@127.0.0.1:{p['pg']}/dinastia",
                "APP_DOMAIN": DOMAIN,
                "APP_PROTOCOL": "http",
                "APP_PUBLIC_PORT": "" if p["web"] == 80 else str(p["web"]),
                "APP_RELEASE": version(),
                "AUTH_SECRET": s["auth"],
                "TRUST_PROXY_HOPS": "1",
                "S3_ENDPOINT": f"http://127.0.0.1:{p['s3']}",
                "S3_REGION": "ru-central1",
                "S3_BUCKET": "dinastia",
                "S3_ACCESS_KEY": s["s3Access"],
                "S3_SECRET_KEY": s["s3Secret"],
                "S3_FORCE_PATH_STYLE": "true",
                "MAIL_TRANSPORT": "smtp",
                "SMTP_HOST": "127.0.0.1",
                "SMTP_PORT": str(p["smtp"]),
                "SMTP_FROM": f"{CENTER_NAME} <noreply@{DOMAIN}>",
                "VIDEO_PROVIDER": "fake",
                "PLAYWRIGHT_BROWSERS_PATH": str(BROWSERS),
                "GATEWAY_PORT": str(p["web"]),
                "WEB_ROOT": str(APP / "web"),
            }
        )
        return env

    def pg_env(self) -> dict:
        return {**os.environ, "PGPASSWORD": self.s["pgSuper"], "PGCLIENTENCODING": "UTF8"}

    # --- запуск

    def spawn(self, name: str, args: list, env: dict | None = None, cwd: Path | None = None) -> subprocess.Popen:
        log_file = LOGS / f"{name}.log"
        fh = open(log_file, "a", encoding="utf-8", errors="replace")
        fh.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} запуск {name}\n")
        fh.flush()
        log.info("запуск %s: %s", name, " ".join(str(a) for a in args))
        proc = subprocess.Popen(
            [str(a) for a in args],
            env=env,
            cwd=cwd,
            stdout=fh,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=(CREATE_NO_WINDOW | NEW_GROUP) if IS_WIN else 0,
        )
        self.job.add(proc)
        self.procs[name] = proc
        return proc

    def ensure_port(self, name: str, port: int) -> None:
        if not port_free(port):
            raise RuntimeError(
                f"Порт {port} ({name}) занят другой программой. Закройте её или перезагрузите компьютер и запустите Dinastia снова."
            )

    def pg_running(self) -> bool:
        res = run([PG_BIN / f"pg_ctl{EXE}", "status", "-D", PG_DATA], check=False)
        return res.returncode == 0

    def start_postgres(self) -> None:
        if self.pg_running():
            log.info("postgres уже запущен")
            return
        self.ensure_port("PostgreSQL", self.p["pg"])
        # вывод — в файл, не в pipe: postgres наследует дескрипторы pg_ctl, и чтение pipe не закончилось бы
        args = [
            PG_BIN / f"pg_ctl{EXE}",
            "start",
            "-w",
            "-t",
            "90",
            "-D",
            PG_DATA,
            "-l",
            LOGS / "postgres.log",
            "-o",
            f"-p {self.p['pg']} -c listen_addresses=127.0.0.1",
        ]
        log.info("$ %s", " ".join(str(a) for a in args))
        with open(LOGS / "pg_ctl.log", "a", encoding="utf-8", errors="replace") as fh:
            code = subprocess.call(
                [str(a) for a in args],
                stdout=fh,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                creationflags=CREATE_NO_WINDOW if IS_WIN else 0,
            )
        if code != 0:
            raise RuntimeError(f"PostgreSQL не запустился (код {code})" + tail(LOGS / "postgres.log") + tail(LOGS / "pg_ctl.log"))

    def stop_postgres(self) -> None:
        if PG_DATA.exists() and self.pg_running():
            run([PG_BIN / f"pg_ctl{EXE}", "stop", "-D", PG_DATA, "-m", "fast", "-w", "-t", "60"], check=False)

    def start_s3(self) -> None:
        if "s3" in self.procs and self.procs["s3"].poll() is None:
            return
        for name, port in (("S3", self.p["s3"]), ("SeaweedFS", self.p["weedMaster"])):
            self.ensure_port(name, port)
        S3_DATA.mkdir(parents=True, exist_ok=True)
        s3_config = DATA / "s3.json"
        s3_config.write_text(
            json.dumps(
                {
                    "identities": [
                        {
                            "name": "dinastia",
                            "credentials": [{"accessKey": self.s["s3Access"], "secretKey": self.s["s3Secret"]}],
                            "actions": ["Admin", "Read", "Write", "List", "Tagging"],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        p = self.p
        proc = self.spawn(
            "s3",
            [
                WEED,
                "server",
                f"-dir={S3_DATA}",
                "-ip=127.0.0.1",
                "-ip.bind=127.0.0.1",
                f"-master.port={p['weedMaster']}",
                f"-volume.port={p['weedVolume']}",
                f"-filer.port={p['weedFiler']}",
                "-master.volumeSizeLimitMB=1024",
                "-volume.max=0",
                "-s3",
                f"-s3.port={p['s3']}",
                f"-s3.config={s3_config}",
                "-s3.allowedOrigins=*",
            ],
        )
        wait_until(lambda: http_ok(f"http://127.0.0.1:{p['s3']}/healthz"), "SeaweedFS", 90, proc, LOGS / "s3.log")

    def ensure_bucket(self) -> None:
        cmd = [WEED, "shell", f"-master=127.0.0.1:{self.p['weedMaster']}"]
        for attempt in range(20):
            res = run(cmd, input_text="s3.bucket.list\n", check=False)
            if res.returncode == 0 and "dinastia" in (res.stdout or ""):
                return
            run(cmd, input_text="s3.bucket.create -name dinastia\n", check=False)
            time.sleep(1.5)
        raise RuntimeError("SeaweedFS: не удалось создать бакет dinastia" + tail(LOGS / "launcher.log"))

    def start_mail(self) -> None:
        if "mail" in self.procs and self.procs["mail"].poll() is None:
            return
        self.ensure_port("почта", self.p["mail"])
        self.ensure_port("SMTP", self.p["smtp"])
        MAIL_DATA.mkdir(parents=True, exist_ok=True)
        proc = self.spawn(
            "mail",
            [
                MAILPIT,
                "--listen",
                f"127.0.0.1:{self.p['mail']}",
                "--smtp",
                f"127.0.0.1:{self.p['smtp']}",
                "--database",
                MAIL_DATA / "mailpit.db",
            ],
        )
        wait_until(lambda: http_ok(f"http://127.0.0.1:{self.p['mail']}/readyz"), "Mailpit", 60, proc, LOGS / "mail.log")

    def start_app(self) -> None:
        env = self.node_env()
        self.ensure_port("API", self.p["api"])
        self.ensure_port("веб", self.p["web"])
        api = self.spawn("api", [NODE, APP / "api" / "dist" / "main.js"], env, APP / "api")
        self.spawn("worker", [NODE, APP / "api" / "dist" / "worker.js"], env, APP / "api")
        wait_until(
            lambda: http_ok(f"http://127.0.0.1:{self.p['api']}/health/ready"), "API", 120, api, LOGS / "api.log"
        )
        gw = self.spawn("gateway", [NODE, APP / "gateway.js"], env, APP)
        wait_until(
            lambda: http_ok(f"http://127.0.0.1:{self.p['web']}/", host=f"{CENTER}.{DOMAIN}"),
            "веб",
            60,
            gw,
            LOGS / "gateway.log",
        )

    def stop_app(self) -> None:
        for name in ("gateway", "api", "worker"):
            self.kill(name)

    def kill(self, name: str) -> None:
        proc = self.procs.pop(name, None)
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(10)
            except subprocess.TimeoutExpired:
                proc.kill()

    def stop_all(self) -> None:
        log.info("остановка служб")
        self.stop_app()
        for name in ("mail", "s3"):
            self.kill(name)
        self.stop_postgres()

    # --- установка

    def init_db_cluster(self) -> None:
        if (PG_DATA / "PG_VERSION").exists():
            return
        PG_DATA.parent.mkdir(parents=True, exist_ok=True)
        pwfile = DATA / "initdb.pw"
        pwfile.write_text(self.s["pgSuper"], encoding="utf-8")
        base = [PG_BIN / f"initdb{EXE}", "-D", PG_DATA, "-U", "postgres", f"--pwfile={pwfile}", "-A", "scram-sha-256"]
        variants = [
            ["-E", "UTF8", "--locale-provider=icu", "--icu-locale=ru-RU", "--locale=C"],
            ["-E", "UTF8", "--locale-provider=builtin", "--builtin-locale=C.UTF-8", "--locale=C"],
            ["-E", "UTF8", "--locale=C"],
        ]
        try:
            for i, extra in enumerate(variants):
                shutil.rmtree(PG_DATA, ignore_errors=True)
                res = run(base + extra, check=i == len(variants) - 1)
                if res.returncode == 0:
                    return
        finally:
            os.unlink(pwfile)

    def psql(self, sql: str, db: str = "postgres") -> str:
        res = run(
            [
                PG_BIN / f"psql{EXE}",
                "-h",
                "127.0.0.1",
                "-p",
                self.p["pg"],
                "-U",
                "postgres",
                "-d",
                db,
                "-v",
                "ON_ERROR_STOP=1",
                "-tA",
                "-f",
                "-",
            ],
            env=self.pg_env(),
            input_text=sql,
        )
        return (res.stdout or "").strip()

    def create_database(self) -> None:
        """Роли и база — как docker/postgres/init.sh (D-006): app_owner — миграции, app_user — приложение без BYPASSRLS."""
        s = self.s
        self.psql(
            f"""
DO $$BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE app_owner LOGIN PASSWORD '{s["appOwner"]}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD '{s["appUser"]}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END$$;
"""
        )
        if self.psql("SELECT 1 FROM pg_database WHERE datname = 'dinastia'") != "1":
            self.psql("CREATE DATABASE dinastia OWNER app_owner")
        self.psql(
            """
REVOKE ALL ON DATABASE dinastia FROM PUBLIC;
GRANT CONNECT ON DATABASE dinastia TO app_user;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO app_owner;
GRANT USAGE ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_user;
""",
            db="dinastia",
        )

    def migrate_and_seed(self) -> None:
        env = self.node_env()
        run([NODE, APP / "api" / "dist" / "db.js", "migrate"], env=env, cwd=APP / "api")
        res = run([NODE, APP / "api" / "dist" / "seed.js"], env=env, cwd=APP / "api")
        lines = [ln for ln in (res.stdout or "").splitlines() if not ln.startswith("{")]
        if lines and "уже есть" not in lines[0]:
            ACCOUNTS.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def setup(self, step=lambda text: None) -> None:
        """Установка и обновление — идемпотентно: повторный запуск доводит до конца и применяет новые миграции."""
        step("База данных")
        self.init_db_cluster()
        self.start_postgres()
        if not self.cfg.get("dbReady"):
            self.create_database()
            self.cfg["dbReady"] = True
            save_config(self.cfg)
        step("Хранилище файлов")
        self.start_s3()
        self.ensure_bucket()
        step("Миграции и демо-данные")
        self.migrate_and_seed()
        self.cfg["setupDone"] = True
        save_config(self.cfg)

    def start(self, step=lambda text: None) -> None:
        if not self.cfg.get("setupDone"):
            self.setup(step)
        else:
            step("База данных")
            self.start_postgres()
            step("Хранилище файлов")
            self.start_s3()
            step("Обновление базы")
            run([NODE, APP / "api" / "dist" / "db.js", "migrate"], env=self.node_env(), cwd=APP / "api")
        step("Почта")
        self.start_mail()
        step("Платформа")
        self.start_app()

    def reset_demo(self, step=lambda text: None) -> None:
        """Сбросить демо-данные: база и файлы — заново, письма — удалить; затем миграции и учебный центр."""
        step("Остановка платформы")
        self.stop_app()
        step("Очистка базы")
        self.psql("DROP DATABASE IF EXISTS dinastia WITH (FORCE)")
        self.create_database()
        step("Очистка файлов")
        self.kill("s3")
        shutil.rmtree(S3_DATA, ignore_errors=True)
        self.start_s3()
        self.ensure_bucket()
        try:
            urllib.request.urlopen(
                urllib.request.Request(f"http://127.0.0.1:{self.p['mail']}/api/v1/messages", method="DELETE"), timeout=5
            )
        except (urllib.error.URLError, OSError):
            pass
        step("Миграции и демо-данные")
        self.migrate_and_seed()
        step("Платформа")
        self.start_app()


# ---------------------------------------------------------------- остановка чужого запуска (инсталлятор)


def stop_installation() -> None:
    """Завершить процессы из папки установки (лаунчер, node, weed, mailpit) и остановить PostgreSQL."""
    if IS_WIN:
        from ctypes import wintypes

        psapi = ctypes.WinDLL("psapi")
        k32 = ctypes.WinDLL("kernel32")
        k32.OpenProcess.restype = wintypes.HANDLE
        k32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        k32.QueryFullProcessImageNameW.argtypes = [
            wintypes.HANDLE,
            wintypes.DWORD,
            wintypes.LPWSTR,
            ctypes.POINTER(wintypes.DWORD),
        ]
        k32.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
        k32.CloseHandle.argtypes = [wintypes.HANDLE]
        pids = (wintypes.DWORD * 4096)()
        needed = wintypes.DWORD()
        psapi.EnumProcesses(pids, ctypes.sizeof(pids), ctypes.byref(needed))
        base = str(BASE.resolve()).lower()
        me = os.getpid()
        skip = {"postgres.exe", "pg_ctl.exe"}  # PostgreSQL останавливается штатно, ниже
        for pid in list(pids)[: needed.value // ctypes.sizeof(wintypes.DWORD)]:
            if not pid or pid == me:
                continue
            h = k32.OpenProcess(0x1000 | 0x0001, False, pid)  # QUERY_LIMITED_INFORMATION | TERMINATE
            if not h:
                continue
            try:
                buf = ctypes.create_unicode_buffer(1024)
                size = wintypes.DWORD(1024)
                if k32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                    path = buf.value.lower()
                    if path.startswith(base) and Path(path).name not in skip:
                        log.info("завершение %s (%s)", path, pid)
                        k32.TerminateProcess(h, 1)
            finally:
                k32.CloseHandle(h)
    cfg = load_config()
    if cfg:
        Services(cfg).stop_postgres()


# ---------------------------------------------------------------- проверка (CI)


SIGN_IN = {"email": "tikhomirova@airgorizont.local", "password": "gorizont2026"}

PDF_CHECK = """
const { chromium } = await import('playwright-core')
const b = await chromium.launch()
const page = await b.newPage()
await page.setContent('<h1>Удостоверение</h1>')
const pdf = await page.pdf({ format: 'A4' })
await b.close()
if (pdf.length < 500) throw new Error('пустой PDF')
console.log('pdf ok', pdf.length)
"""


def selftest(svc: Services) -> None:
    p = svc.p
    origin = web_origin(svc.cfg, CENTER)
    host = f"{CENTER}.{DOMAIN}" + ("" if p["web"] == 80 else f":{p['web']}")
    svc.start(lambda t: log.info("шаг: %s", t))
    for url, h in (
        (f"http://127.0.0.1:{p['web']}/health/ready", None),
        (f"http://127.0.0.1:{p['web']}/", host),
        (f"http://127.0.0.1:{p['web']}/api/branding.css", host),
        (f"http://127.0.0.1:{p['mail']}/readyz", None),
    ):
        if not http_ok(url, h):
            raise RuntimeError(f"проверка: {url} (Host: {h}) не отвечает")
    req = urllib.request.Request(
        f"http://127.0.0.1:{p['web']}/api/auth/sign-in/email",
        data=json.dumps(SIGN_IN).encode(),
        headers={"Host": host, "Origin": origin, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        body = json.loads(r.read())
        if "Тихомирова" not in body.get("user", {}).get("name", ""):
            raise RuntimeError(f"проверка: вход слушателя — неожиданный ответ {body}")
    if IS_WIN:  # из исходников на macOS свой Chromium Playwright не ставится (kernel/documents/pdf.ts)
        run([NODE, "--input-type=module", "-e", PDF_CHECK], env=svc.node_env(), cwd=APP / "api")
    log.info("selftest — ok")


# ---------------------------------------------------------------- окно


SPLASH = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#1c2330;--muted:#677085;--accent:#2563eb;--err:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#12151b;--fg:#e8ebf1;--muted:#9aa3b5;--accent:#6b9bff;--err:#ff8a80}}
body{margin:0;height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);
font:15px/1.5 "Segoe UI",system-ui,sans-serif}
main{width:min(460px,90vw)}h1{font-size:22px;margin:0 0 4px}p{margin:0;color:var(--muted)}
ol{list-style:none;padding:0;margin:24px 0}li{padding:6px 0;color:var(--muted)}li.now{color:var(--fg);font-weight:600}
li.done::before{content:"✓ ";color:var(--accent)}li.now::before{content:"… ";color:var(--accent)}
pre{white-space:pre-wrap;font:12px/1.45 Consolas,monospace;color:var(--err);max-height:45vh;overflow:auto}
</style></head><body><main><h1>Dinastia</h1><p>Учебный центр АИР «Горизонт» · VERSION</p>
<ol id="steps"></ol><pre id="err"></pre></main><script>
function step(t){const l=document.getElementById('steps');for(const li of l.children){li.className='done'}
const li=document.createElement('li');li.className='now';li.textContent=t;l.appendChild(li)}
function fail(t){document.getElementById('err').textContent=t}
</script></body></html>"""


def webview2_installed() -> bool:
    import winreg

    key = r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    for root, path in (
        (winreg.HKEY_LOCAL_MACHINE, key),
        (winreg.HKEY_CURRENT_USER, key.replace("WOW6432Node\\", "")),
        (winreg.HKEY_LOCAL_MACHINE, key.replace("WOW6432Node\\", "")),
    ):
        try:
            with winreg.OpenKey(root, path) as k:
                v, _ = winreg.QueryValueEx(k, "pv")
                if v and v != "0.0.0.0":
                    return True
        except OSError:
            continue
    return False


def message(text: str, error: bool = False) -> None:
    log.info("сообщение: %s", text)
    if IS_WIN:
        ctypes.windll.user32.MessageBoxW(None, text, "Dinastia", 0x10 if error else 0x40)
    else:
        print(text)


def single_instance() -> bool:
    if not IS_WIN:
        return True
    ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\DinastiaLauncher")
    return ctypes.windll.kernel32.GetLastError() != 183  # ERROR_ALREADY_EXISTS


def open_path(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if IS_WIN:
        os.startfile(path)  # type: ignore[attr-defined]


def gui(svc: Services) -> None:
    import webview
    from webview.menu import Menu, MenuAction, MenuSeparator

    center = web_origin(svc.cfg, CENTER) + "/"
    ops = web_origin(svc.cfg) + "/ops"
    mail = f"http://127.0.0.1:{svc.p['mail']}/"
    state = {"ready": False}

    window = webview.create_window(
        TITLE, html=SPLASH.replace("VERSION", version()), width=1360, height=880, min_size=(900, 600), confirm_close=False
    )

    def step(text: str) -> None:
        log.info("шаг: %s", text)
        window.evaluate_js(f"step({json.dumps(text)})")

    def boot() -> None:
        try:
            svc.start(step)
            state["ready"] = True
            window.load_url(center)
        except Exception as e:  # noqa: BLE001 — показать человеку и записать
            log.exception("запуск не удался")
            window.evaluate_js(
                f"fail({json.dumps(f'Не удалось запустить: {e}{chr(10)}{chr(10)}Логи: {LOGS}')})"
            )

    def go(url: str):
        return lambda: state["ready"] and window.load_url(url)

    def show_mail() -> None:
        if state["ready"]:
            webview.create_window("Почта — Dinastia", mail, width=1200, height=800)

    def show_accounts() -> None:
        text = ACCOUNTS.read_text(encoding="utf-8") if ACCOUNTS.exists() else "Список появится после установки."
        html = (
            "<!doctype html><meta charset=utf-8><style>body{font:14px/1.6 Consolas,monospace;padding:20px;"
            "white-space:pre;color-scheme:light dark}</style>" + text.replace("&", "&amp;").replace("<", "&lt;")
        )
        webview.create_window("Пользователи демо-данных", html=html, width=820, height=360)

    def reset() -> None:
        if not state["ready"]:
            return
        if not window.create_confirmation_dialog(
            "Сбросить демо-данные?",
            "Все изменения, прохождения курса, загруженные файлы и письма будут удалены, "
            "учебный центр АИР «Горизонт» загрузится заново.",
        ):
            return
        state["ready"] = False
        window.load_html(SPLASH.replace("VERSION", version()))

        def work() -> None:
            try:
                svc.reset_demo(step)
                state["ready"] = True
                window.load_url(center)
            except Exception as e:  # noqa: BLE001
                log.exception("сброс не удался")
                window.evaluate_js(f"fail({json.dumps(f'Не удалось сбросить: {e}')})")

        threading.Thread(target=work, daemon=True).start()

    menu = [
        Menu(
            "Dinastia",
            [
                MenuAction("Учебный центр", go(center)),
                MenuAction("Консоль оператора", go(ops)),
                MenuAction("Почта (письма платформы)", show_mail),
                MenuSeparator(),
                MenuAction("Пользователи демо-данных", show_accounts),
                MenuAction("Сбросить демо-данные…", reset),
                MenuSeparator(),
                MenuAction("Папка логов", lambda: open_path(LOGS)),
                MenuAction(f"Версия {version()}", lambda: None),
            ],
        ),
        Menu("Вид", [MenuAction("Обновить страницу", lambda: window.evaluate_js("location.reload()"))]),
    ]

    def on_closed() -> None:
        for w in list(webview.windows):
            if w is not window:
                w.destroy()

    window.events.closed += on_closed
    (DATA / "webview").mkdir(parents=True, exist_ok=True)
    try:
        webview.start(boot, gui="edgechromium", menu=menu, private_mode=False, storage_path=str(DATA / "webview"))
    finally:
        svc.stop_all()


def edge_fallback(svc: Services) -> None:
    """WebView2 нет — окно Edge в режиме приложения со своим профилем; закрытие окна останавливает службы."""
    edge = None
    for env in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        cand = Path(os.environ.get(env, "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
        if cand.exists():
            edge = cand
            break
    try:
        svc.start(lambda t: log.info("шаг: %s", t))
        url = web_origin(svc.cfg, CENTER) + "/"
        if edge:
            subprocess.run([str(edge), f"--app={url}", f"--user-data-dir={DATA / 'edge'}", "--no-first-run"])
        else:
            import webbrowser

            webbrowser.open(url)
            message(f"Dinastia запущена: {url}\n\nНажмите «ОК», чтобы остановить платформу.")
    finally:
        svc.stop_all()


# ---------------------------------------------------------------- вход


def main() -> int:
    parser = argparse.ArgumentParser(prog="Dinastia")
    parser.add_argument("--setup", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--stop", action="store_true")
    args = parser.parse_args()

    LOGS.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=LOGS / "launcher.log",
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        encoding="utf-8",
    )
    log.info("Dinastia %s, установка %s, данные %s, режим %s", version(), BASE, DATA, sys.argv[1:])

    if args.stop:
        stop_installation()
        return 0

    if not (args.setup or args.selftest) and not single_instance():
        message("Dinastia уже запущена — окно открыто на панели задач.")
        return 0

    cfg = load_config()
    if cfg is None:
        cfg = new_config()
        save_config(cfg)
    svc = Services(cfg)

    try:
        if args.setup:
            try:
                svc.setup(lambda t: log.info("шаг: %s", t))
            finally:
                svc.stop_all()
            return 0
        if args.selftest:
            try:
                selftest(svc)
            finally:
                svc.stop_all()
            return 0
        if IS_WIN and not webview2_installed():
            edge_fallback(svc)
        else:
            gui(svc)
        return 0
    except Exception as e:  # noqa: BLE001
        log.exception("ошибка")
        if not (args.setup or args.selftest):
            message(f"Не удалось запустить Dinastia:\n{e}\n\nЛоги: {LOGS}", error=True)
        print(e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
