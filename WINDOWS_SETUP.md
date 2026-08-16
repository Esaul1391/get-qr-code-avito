# Установка и запуск на Windows

Эта инструкция предназначена для Windows 10/11 и Google Chrome. Она описывает
ручной запуск DEV-backend на порту `8011` и установку распакованного расширения.

> В текущей версии автоматический запуск backend через Native Messaging для
> Windows не настроен. Перед использованием расширения backend нужно запускать
> вручную и оставлять окно PowerShell открытым.

## 1. Установите Git и Python

Откройте PowerShell и выполните:

```powershell
winget install --id Git.Git -e --source winget
winget install --id Python.Python.3.12 -e --source winget
```

После установки полностью закройте PowerShell и откройте его заново. Проверьте
установленные программы:

```powershell
git --version
py -3.12 --version
```

Если команда `winget` не найдена, установите приложение «Установщик приложений»
(App Installer) из Microsoft Store или скачайте Git и Python с официальных
сайтов. При ручной установке Python включите опцию добавления Python в `PATH`.

## 2. Клонируйте проект

Пример установки в `D:\Projects`:

```powershell
New-Item -ItemType Directory -Path "D:\Projects" -Force
Set-Location "D:\Projects"
git clone https://github.com/Esaul1391/get-qr-code-avito.git
Set-Location "D:\Projects\get-qr-code-avito"
```

Если проект уже клонирован, достаточно перейти в него:

```powershell
Set-Location "D:\Projects\get-qr-code-avito"
```

## 3. Создайте виртуальное окружение

```powershell
py -3.12 -m venv .venv
```

Активировать окружение необязательно. Во всех командах ниже используется Python
непосредственно из `.venv`, поэтому изменение политики выполнения PowerShell не
требуется.

## 4. Установите зависимости

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 5. Создайте локальные настройки

```powershell
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}
```

По умолчанию физическая печать отключена:

```dotenv
AVITO_DEV_PRINT_ENABLED=false
```

При желании можно задать стандартную папку для этикеток в `.env`:

```dotenv
AVITO_DEV_LABELS_DIR=D:\AvitoLabels
```

Путь также можно изменить позднее в popup расширения.

## 6. Запустите тесты

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

При успешном выполнении последняя строка должна содержать `OK`.

## 7. Запустите backend

Находясь в корне проекта, выполните:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8011
```

Не закрывайте это окно PowerShell, пока используете расширение. Остановить
backend можно сочетанием `Ctrl+C`.

Для проверки откройте второе окно PowerShell и выполните:

```powershell
Invoke-RestMethod http://127.0.0.1:8011/parse/ping
```

Ожидаемый результат:

```text
status        : ok
instance      : codes-harvester-dev
port          : 8011
print_enabled : False
```

Документация HTTP API будет доступна по адресу:

<http://127.0.0.1:8011/docs>

## 8. Установите расширение в Chrome

1. Откройте `chrome://extensions`.
2. Включите «Режим разработчика».
3. Нажмите «Загрузить распакованное расширение».
4. Выберите папку `D:\Projects\get-qr-code-avito\extension`.
5. Убедитесь, что появилось расширение **Codes Harvester DEV**.

Выбирать нужно именно каталог `extension`, внутри которого находится
`manifest.json`. Каталоги `scripts` и корень проекта выбирать нельзя.

После изменения файлов расширения нажмите кнопку обновления на его карточке в
`chrome://extensions`, а затем обновите вкладку Avito.

## 9. Использование

### Синхронизация объявлений и городов

1. Запустите backend.
2. Откройте в Avito страницу «Мои объявления»:
   `/profile/pro/items` или `/profile/items`.
3. Откройте popup расширения.
4. Нажмите «Синхронизировать объявления».

Это нужно сделать перед использованием фильтра заказов по городу. Сейчас
поддерживаются Москва и Энгельс.

### Сбор заказов

1. Запустите backend и оставьте PowerShell открытым.
2. Откройте `https://www.avito.ru/orders`.
3. При необходимости настройте город и папку этикеток в popup.
4. Нажмите «Собрать».

Расширение обрабатывает заказы со статусом «Отправьте заказ» и загружает не
более четырёх дополнительных порций заказов. PNG-этикетки сохраняются в папку с
текущей датой. По умолчанию это:

```text
.runtime\dev\orders\ГГГГ-ММ-ДД\
```

## Ежедневный запуск

После первоначальной установки достаточно выполнить одну команду:

```powershell
Set-Location "D:\Projects\get-qr-code-avito"
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8011
```

После этого можно открыть Avito и пользоваться расширением.

## Обновление проекта

Закройте backend, перейдите в проект и выполните:

```powershell
Set-Location "D:\Projects\get-qr-code-avito"
git pull
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Затем снова запустите backend, обновите расширение на странице
`chrome://extensions` и перезагрузите вкладку Avito.

## Частые ошибки

### `git`, `py` или `python` не является командой

Полностью закройте PowerShell и откройте заново. Если это не помогло, повторите
установку Git или Python и проверьте, что они добавлены в `PATH`.

### Chrome сообщает «Не удалось загрузить манифест»

Выбрана неправильная папка. Укажите:

```text
D:\Projects\get-qr-code-avito\extension
```

### Popup сообщает, что Native Messaging Host не найден

На Windows сначала вручную запустите backend командой из раздела 7. Если он
доступен на порту `8011`, расширение не будет пытаться использовать Native Host.

### Порт 8011 уже занят

Посмотрите, какой процесс использует порт:

```powershell
Get-NetTCPConnection -LocalPort 8011 -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, State, OwningProcess
```

Закройте ранее запущенный экземпляр backend и повторите запуск. Не меняйте порт
без одновременного изменения настроек backend и расширения.

### После нажатия «Собрать» ничего не найдено

- Обновите страницу Avito после загрузки или обновления расширения.
- Убедитесь, что открыта страница `/orders`.
- Обрабатываются только заказы со статусом «Отправьте заказ».
- Если включён фильтр города, сначала синхронизируйте объявления.

### Физическая печать не работает

Текущая реализация физической печати использует Linux-команду `lp`. На Windows
создание и сохранение PNG-этикеток работает, но автоматическая отправка на
принтер пока не реализована.
