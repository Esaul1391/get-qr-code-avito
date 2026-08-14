#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python_executable="${PYTHON_EXECUTABLE:-python3}"

if ! command -v "$python_executable" >/dev/null 2>&1; then
  echo "Не найден Python: $python_executable" >&2
  exit 1
fi

if [ ! -d "$project_root/.venv" ]; then
  "$python_executable" -m venv "$project_root/.venv"
fi

"$project_root/.venv/bin/python" -m pip install --upgrade pip
"$project_root/.venv/bin/python" -m pip install -r "$project_root/requirements.txt"

echo "DEV-окружение готово: $project_root/.venv"
