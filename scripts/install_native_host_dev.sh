#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Использование: $0 EXTENSION_ID [chrome|chromium|brave]" >&2
  exit 1
fi

extension_id="$1"
browser="${2:-chrome}"

if [[ ! "$extension_id" =~ ^[a-p]{32}$ ]]; then
  echo "Некорректный ID расширения: ожидаются 32 символа a-p" >&2
  exit 1
fi

config_root="${XDG_CONFIG_HOME:-$HOME/.config}"
case "$browser" in
  chrome) manifest_dir="$config_root/google-chrome/NativeMessagingHosts" ;;
  chromium) manifest_dir="$config_root/chromium/NativeMessagingHosts" ;;
  brave) manifest_dir="$config_root/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
  *)
    echo "Неизвестный браузер: $browser" >&2
    exit 1
    ;;
esac

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
host_path="$project_root/native_host/avito_backend_host.py"
manifest_file="$manifest_dir/com.codes_harvester.backend.dev.json"

mkdir -p "$manifest_dir"
chmod +x "$host_path"

python3 - "$host_path" "$extension_id" "$manifest_file" <<'PY'
import json
import sys
from pathlib import Path

host_path, extension_id, manifest_file = sys.argv[1:]
manifest = {
    "name": "com.codes_harvester.backend.dev",
    "description": "Starts the isolated Codes Harvester DEV backend",
    "path": str(Path(host_path).resolve()),
    "type": "stdio",
    "allowed_origins": [f"chrome-extension://{extension_id}/"],
}
Path(manifest_file).write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
PY

echo "DEV Native Host установлен: $manifest_file"
echo "Эталонный com.codes_harvester.backend.json не изменялся."
