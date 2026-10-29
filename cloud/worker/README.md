# Воркер рендера: Space-образ и датасет на Hugging Face (делается один раз)

Параллельный рендер (`cloud/hf_render.py`) запускает задачи Hugging Face Jobs. Каждая задача берёт **готовый Docker-образ** и рендерит свой кусок урока. Образ живёт в вашем приватном Space `remotion-speed-worker`, а промежуточные файлы (бандл, куски, результаты проверки сцен) — в вашем приватном датасете `video-render-assets`.

| Файл | Зачем |
|---|---|
| `Dockerfile` | node 22 + Chromium (прогревается при сборке) + ffmpeg + шрифты + Remotion из `package.json` проекта + python с `huggingface_hub` |
| `render_chunk.py` | воркер: скачать бандл → распаковать → `remotion render --frames=a-b --muted` → загрузить кусок в датасет |
| `app.py` | заглушка на порту 7860, чтобы Space не показывал «Runtime error» (рендер идёт не в Space, а в Jobs) |
| `setup_hf.py` | создаёт датасет и Space, кладёт в Space нужные файлы, ждёт сборку образа |

## Что нужно заранее
1. Аккаунт Hugging Face с привязанной картой (карта нужна площадке; при нулевом использовании ничего не списывается) и токен с правом **write**: huggingface.co → Settings → Access Tokens → New token → тип *Write*. Для fine-grained токена нужны права на создание/запись репозиториев и на запуск Jobs — **проверить** в интерфейсе токена.
2. Токен — только в переменную окружения (файл `.env` в корне набора, он в `.gitignore`): `HF_TOKEN=…`. Не печатайте и не коммитьте его.
3. `pip install -r cloud/requirements.txt`, в `remotion/` выполнен `npm install` (нужен `package-lock.json`: версии Remotion в образе и в проекте обязаны совпасть).

## Быстрый путь (одна команда)
```bash
python3 cloud/worker/setup_hf.py --project remotion --dry-run   # что будет создано (токен и сеть не нужны)
python3 cloud/worker/setup_hf.py --project remotion             # создать, загрузить, дождаться сборки образа
```
Скрипт: создаёт приватный датасет `<вы>/video-render-assets` и приватный Space `<вы>/remotion-speed-worker` (SDK Docker); кладёт в Space `Dockerfile`, `render_chunk.py`, `app.py` и **`package.json` + `package-lock.json` из `remotion/`** (они должны лежать рядом с Dockerfile перед сборкой); ждёт стадию `RUNNING`. В конце печатает две строки для `.env`:
```
HF_DATASET=<вы>/video-render-assets
HF_WORKER_IMAGE=hf.co/spaces/<вы>/remotion-speed-worker
```
Сборка образа — несколько минут (по опыту автора 5–10, **проверить** у себя). Если сборка упала (`BUILD_ERROR`) — откройте логи Space (ссылка печатается) и пришлите их агенту.

Необязательная проверка образа: `python3 cloud/worker/setup_hf.py --project remotion --smoke` — запускает одну пробную задачу `remotion --version` на `cpu-upgrade` (платно: минимум одна минута по $0.03/ч ≈ $0.0005).

## Ручной путь (через сайт, если скрипт не подходит)
1. **Датасет:** huggingface.co → New → Dataset → имя `video-render-assets` → *Private*.
2. **Space:** New → Space → имя `remotion-speed-worker` → SDK **Docker** (Blank) → *Private*; железо — базовое (рендер идёт не в Space). 
3. **Файлы Space** (Files → Add file → Upload): `Dockerfile`, `render_chunk.py`, `app.py` из этой папки и **`package.json`, `package-lock.json` из `remotion/`**. В `README.md` Space должна быть шапка с `sdk: docker` и `app_port: 7860` (создаётся вместе с Space; шаблон — в `setup_hf.py`, константа `SPACE_README`).
4. Дождаться сборки: вкладка Logs → стадия *Running*.

## Когда пересобирать образ
- сменили версию Remotion в `remotion/package.json` (или добавили зависимость, которая нужна при сборке бандла) → залейте новые `package.json`/`package-lock.json` (проще всего повторить `setup_hf.py`);
- поменяли `render_chunk.py` или `Dockerfile` — то же самое.
Бандл урока в образ не входит: он выгружается в датасет при каждом рендере.

## Контракт воркера (для отладки)
Оркестратор запускает в задаче:
```
python3 /app/render_chunk.py --comp Lesson1 --bundle bundles/bundle_l1.tar.gz --frames 0-324 \
  --scale 1.3333333333333333 --concurrency 4 --out chunk_000_0_324.mp4 \
  --upload-prefix renders/<run_id> --repo <вы>/video-render-assets
```
Токен приходит секретом задачи (`HF_TOKEN`). Воркер печатает блок `=== BENCHMARK_RESULT_JSON ===` с временами этапов — оркестратор читает его из логов. Кусок загружается с повтором и случайной паузой: десятки задач заканчивают одновременно, возможен конфликт коммитов (HTTP 409).

## Частые проблемы
| Симптом | Причина → что делать |
|---|---|
| `npm ci` падает при сборке образа | `package-lock.json` не совпадает с `package.json` → в `remotion/` выполнить `npm install`, перезалить оба файла |
| сборка падает на `test -x /rt/node_modules/.bin/remotion` | в `package.json` проекта нет `@remotion/cli` → добавить зависимость, `npm install`, перезалить |
| задача сразу падает, в логах `exec: "--secrets"` | это про ручной запуск `hf jobs run`: флаги (`--flavor`, `--secrets`) ставят **до** имени образа; `hf_render.py` запускает задачи через API и этой ошибки не даёт |
| задача: `cannot find .../render_chunk.py` | Space собран без файла → проверить список файлов Space, перезалить |
| Chromium падает, в кадрах «квадраты» вместо символов | не хватает шрифтов → список пакетов в `Dockerfile` (строка `fonts-*`), пересобрать |
