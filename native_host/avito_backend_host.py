#!/usr/bin/python3
import json
import os
import struct
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PYTHON_EXECUTABLE = (
    PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if os.name == "nt"
    else PROJECT_ROOT / ".venv" / "bin" / "python"
)
BACKEND_PORT = 8011
BACKEND_INSTANCE = "codes-harvester-dev"
BACKEND_URL = f"http://127.0.0.1:{BACKEND_PORT}/parse/ping"
LOG_DIRECTORY = PROJECT_ROOT / ".runtime" / "dev" / "logs"
LOG_FILE = LOG_DIRECTORY / "native_backend.log"
START_TIMEOUT_SECONDS = 15


def backend_is_ready(timeout: float = 0.5) -> bool:
    try:
        with urlopen(BACKEND_URL, timeout=timeout) as response:
            payload = json.load(response)
            return (
                response.status == 200
                and payload.get("instance") == BACKEND_INSTANCE
            )
    except (OSError, URLError, ValueError, json.JSONDecodeError):
        return False


def start_backend() -> dict[str, Any]:
    if backend_is_ready():
        return {"ok": True, "status": "already_running", "started": False}

    if not PYTHON_EXECUTABLE.is_file():
        return {
            "ok": False,
            "error": f"Не найден Python проекта: {PYTHON_EXECUTABLE}",
        }

    LOG_DIRECTORY.mkdir(parents=True, exist_ok=True)
    command = [
        str(PYTHON_EXECUTABLE),
        "-m",
        "uvicorn",
        "backend.app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(BACKEND_PORT),
    ]

    try:
        with LOG_FILE.open("ab") as log:
            process_options: dict[str, Any] = {
                "cwd": str(PROJECT_ROOT),
                "stdin": subprocess.DEVNULL,
                "stdout": log,
                "stderr": subprocess.STDOUT,
                "env": {**os.environ, "PYTHONUNBUFFERED": "1"},
            }
            if os.name == "nt":
                process_options["creationflags"] = (
                    getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                    | getattr(subprocess, "DETACHED_PROCESS", 0)
                )
            else:
                process_options["start_new_session"] = True

            process = subprocess.Popen(command, **process_options)
    except OSError as error:
        return {"ok": False, "error": f"Не удалось запустить backend: {error}"}

    deadline = time.monotonic() + START_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if backend_is_ready():
            return {
                "ok": True,
                "status": "started",
                "started": True,
                "pid": process.pid,
                "log_file": str(LOG_FILE),
            }
        if process.poll() is not None:
            return {
                "ok": False,
                "error": f"Backend завершился с кодом {process.returncode}. Лог: {LOG_FILE}",
            }
        time.sleep(0.2)

    return {
        "ok": False,
        "error": f"Backend не запустился за {START_TIMEOUT_SECONDS} секунд. Лог: {LOG_FILE}",
    }


def read_native_message() -> dict[str, Any] | None:
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) != 4:
        return None
    message_length = struct.unpack("<I", raw_length)[0]
    payload = sys.stdin.buffer.read(message_length)
    if len(payload) != message_length:
        return None
    return json.loads(payload.decode("utf-8"))


def write_native_message(message: dict[str, Any]) -> None:
    payload = json.dumps(message, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def main() -> None:
    message = read_native_message()
    if message is None:
        return
    if message.get("type") != "START_BACKEND":
        write_native_message({"ok": False, "error": "Неизвестная команда"})
        return
    write_native_message(start_backend())


if __name__ == "__main__":
    main()
