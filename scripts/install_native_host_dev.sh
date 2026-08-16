#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 2 ]; then
  echo "Использование: $0 [EXTENSION_ID] [chrome|chromium|brave]" >&2
  exit 1
fi

if [ "$#" -eq 1 ] && [[ "$1" =~ ^(chrome|chromium|brave)$ ]]; then
  extension_id=""
  browser="$1"
else
  extension_id="${1:-}"
  browser="${2:-chrome}"
fi

config_root="${XDG_CONFIG_HOME:-$HOME/.config}"
case "$browser" in
  chrome) browser_root="$config_root/google-chrome" ;;
  chromium) browser_root="$config_root/chromium" ;;
  brave) browser_root="$config_root/BraveSoftware/Brave-Browser" ;;
  *)
    echo "Неизвестный браузер: $browser" >&2
    exit 1
    ;;
esac

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
host_path="$project_root/native_host/avito_backend_host.py"
extension_path="$project_root/extension"
manifest_dir="$browser_root/NativeMessagingHosts"
manifest_file="$manifest_dir/com.codes_harvester.backend.dev.json"

if [ -z "$extension_id" ]; then
  extension_id="$(python3 - "$browser_root" "$extension_path" <<'PY'
import json
import sys
from pathlib import Path

browser_root = Path(sys.argv[1])
extension_path = Path(sys.argv[2]).resolve()
matches = set()

for preferences in browser_root.glob("*/Preferences"):
    try:
        data = json.loads(preferences.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        continue

    settings = data.get("extensions", {}).get("settings", {})
    for extension_id, extension in settings.items():
        saved_path = extension.get("path")
        if not saved_path:
            continue
        try:
            if Path(saved_path).resolve() == extension_path:
                matches.add(extension_id)
        except OSError:
            continue

if len(matches) == 1:
    print(matches.pop())
PY
)"

  if [ -z "$extension_id" ]; then
    echo "Не удалось автоматически найти DEV-расширение в профилях $browser." >&2
    echo "Откройте страницу расширений и передайте ID вручную:" >&2
    echo "  $0 EXTENSION_ID $browser" >&2
    exit 1
  fi

  echo "Найден ID DEV-расширения: $extension_id"
fi

if [[ ! "$extension_id" =~ ^[a-p]{32}$ ]]; then
  echo "Некорректный ID расширения: ожидаются 32 символа a-p" >&2
  exit 1
fi

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
