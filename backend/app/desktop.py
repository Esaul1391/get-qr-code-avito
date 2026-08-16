import os
import shutil
import subprocess
from pathlib import Path


def open_directory(directory: Path) -> str:
    directory = directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)

    if os.name == "nt":
        try:
            os.startfile(str(directory))
        except (AttributeError, OSError) as error:
            raise RuntimeError(f"Не удалось открыть папку: {error}") from error
        return str(directory)

    xdg_open = shutil.which("xdg-open")
    gio = shutil.which("gio")
    if xdg_open:
        command = [xdg_open, str(directory)]
    elif gio:
        command = [gio, "open", str(directory)]
    else:
        raise RuntimeError("Не найдена программа для открытия файлового менеджера")

    try:
        subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as error:
        raise RuntimeError(f"Не удалось открыть папку: {error}") from error

    return str(directory)
