import json
import os
from pathlib import Path
from threading import RLock
from typing import Any

from backend.app.config import settings


STATE_FILE = settings.resolved_runtime_dir / "label_settings.json"
_STATE_LOCK = RLock()


def _read_saved_directory_unlocked() -> str | None:
    if not STATE_FILE.exists():
        return None

    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    value = state.get("labels_directory") if isinstance(state, dict) else None
    return value.strip() if isinstance(value, str) and value.strip() else None


def _write_saved_directory_unlocked(directory: str | None) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = STATE_FILE.with_suffix(".tmp")
    temporary_file.write_text(
        json.dumps(
            {"labels_directory": directory},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    temporary_file.replace(STATE_FILE)


def _resolve_absolute_directory(value: str) -> Path:
    if "\x00" in value:
        raise ValueError("Путь содержит недопустимый нулевой символ")

    expanded = os.path.expandvars(value.strip())
    directory = Path(expanded).expanduser()
    if not directory.is_absolute():
        if os.name == "nt":
            example = r"C:\AvitoLabels"
        else:
            example = "/home/user/AvitoLabels"
        raise ValueError(f"Укажите абсолютный путь, например: {example}")

    directory = directory.resolve()
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise ValueError(f"Не удалось создать папку: {error}") from error

    if not directory.is_dir():
        raise ValueError("Указанный путь не является папкой")
    if not os.access(directory, os.W_OK):
        raise ValueError("Нет прав на запись в указанную папку")
    return directory


def get_labels_directory(default_directory: Path | None = None) -> Path:
    default = (default_directory or settings.default_labels_dir).expanduser().resolve()
    with _STATE_LOCK:
        saved = _read_saved_directory_unlocked()

    if not saved:
        return default

    try:
        return _resolve_absolute_directory(saved)
    except ValueError:
        return default


def get_public_label_settings(default_directory: Path | None = None) -> dict[str, Any]:
    default = (default_directory or settings.default_labels_dir).expanduser().resolve()
    with _STATE_LOCK:
        saved = _read_saved_directory_unlocked()
    effective = get_labels_directory(default)

    return {
        "labels_directory": str(effective),
        "default_directory": str(default),
        "is_custom": bool(saved and effective != default),
        "creates_date_subdirectory": True,
        "platform": "windows" if os.name == "nt" else "linux",
    }


def update_labels_directory(
    labels_directory: str | None,
    default_directory: Path | None = None,
) -> dict[str, Any]:
    value = labels_directory.strip() if isinstance(labels_directory, str) else ""
    resolved = _resolve_absolute_directory(value) if value else None

    with _STATE_LOCK:
        _write_saved_directory_unlocked(str(resolved) if resolved else None)

    return get_public_label_settings(default_directory)
