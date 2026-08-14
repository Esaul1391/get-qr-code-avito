from backend.app.config import settings


DEV_BACKEND_INSTANCE = "codes-harvester-dev"
DEV_BACKEND_PORT = 8011

# Эквивалент команды: lp -d XP-DT426B *
# Список файлов за текущий день добавляется программно без shell/glob.
PRINT_ORDERS_COMMAND = ("lp", "-d", settings.printer_name)
PRINT_ORDERS_ENABLED = settings.print_enabled
