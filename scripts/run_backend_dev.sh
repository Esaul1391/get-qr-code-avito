#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python_executable="$project_root/.venv/bin/python"

if [ ! -x "$python_executable" ]; then
  echo "Сначала выполните: $project_root/scripts/bootstrap_dev.sh" >&2
  exit 1
fi

cd "$project_root"
exec "$python_executable" -m uvicorn backend.app.main:app \
  --host 127.0.0.1 \
  --port 8011
