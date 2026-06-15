# Rent-2.0 — бэкенд

Node.js + Express, PostgreSQL.

## Настройка

1. Создайте базу `rent_db` и расширение `pgcrypto` (если ещё не сделано).

2. Скопируйте шаблон окружения и укажите пароль:

   ```bash
   copy .env.example .env
   ```

   В `.env` задайте `DATABASE_URL`, например:

   `postgres://postgres:ВАШ_ПАРОЛЬ@localhost:5432/rent_db`

3. Установите зависимости:

   ```bash
   npm install
   ```

4. Примените схему таблиц:

   ```bash
   psql -U postgres -d rent_db -f db/schema.sql
   ```

   Команда идемпотентна за счёт `CREATE TABLE IF NOT EXISTS`. Если в базе уже были **другие** определения этих таблиц (другие колонки), сначала удалите старые таблицы или создайте чистую базу — иначе `CREATE TABLE` не изменит структуру существующих таблиц.

   Для существующих баз дополнительно применяйте файлы из `db/migrations/` по порядку (например `014_drop_bases_and_legacy_map_keys.sql`, `015_create_events_tables.sql`). При старте сервер также вызывает `ensureAppSchema()` — создаёт недостающие таблицы (`events`, `favorites`, `owner_clients` и др.), но **не** удаляет устаревшие объекты; для этого нужны миграции.

5. Запуск в режиме разработки (порт по умолчанию **3000**):

   ```bash
   npm run dev
   ```

## Проверка

- `GET http://localhost:3000/health` — статус сервера и подключения к БД (`status: "ok"`, `db: true`).
- Импорт в Postman: файл `postman_collection.json` в корне репозитория (переменная `base_url`).

## API (v1)

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/v1/clients` | Список клиентов |
| POST | `/api/v1/clients` | Создание клиента |
| GET | `/api/v1/items` | Список вещей (не скрытые) |
| POST | `/api/v1/items` | Создание вещи (`owner_id` в теле) |
| GET | `/api/v1/bookings` | Список броней |
| POST | `/api/v1/bookings` | Создание брони (`client_id`, `item_id`, `start_at`, `end_at`, опционально `total_price`) |

Подключение к PostgreSQL: пул `pg` через `DATABASE_URL` (см. `src/db.js`), переменные окружения загружаются в `src/server.js` через `dotenv`.

## Изоляция данных владельцев

После `POST /api/v1/auth/owner/login` API возвращает `token` (JWT). Админка (`Frontend_admin`) отправляет `Authorization: Bearer <token>` — все запросы к `/owner/*` и `/clients/*` видят только данные этого владельца.

Публичный каталог VK: `GET /api/v1/items?ownerId=<uuid>` и `GET /api/v1/events?ownerId=<uuid>` — без `ownerId` вернётся ошибка 400.

В `.env` задайте `JWT_SECRET` для продакшена.

## Загрузка изображений

- `POST /api/v1/owner/uploads/image` — `multipart/form-data`, поле **`file`** (требуется JWT владельца).
- Сервер сжимает в **WebP** (до 1600px по длинной стороне) и сохраняет в `uploads/<ownerId>/`.
- Ответ: `{ url, width, height, size, format }`, где `url` вида `/uploads/<ownerId>/<file>.webp`.
- Файлы отдаются по `GET /uploads/...` (статика Express).

Переменные окружения (см. `.env.example`):

- `PUBLIC_BASE_URL` — публичный origin API (например `https://api.example.com`), чтобы в ответах профиля и магазина URL были абсолютными для VK Mini Apps.
- `UPLOADS_DIR`, `UPLOAD_MAX_INPUT_BYTES`, `UPLOAD_MAX_EDGE`, `UPLOAD_WEBP_QUALITY` — опционально.

В профиле владельца (`photoUrl`, `shopPhotoUrl`) допустимы пути `/uploads/<ваш-owner-id>/...`, `https://...` или короткий `data:` (legacy).

## Media & Events

- `events.status` хранит только `draft | published | cancelled`.
- Производные состояния (`isFinished`, `isFull`, `isRegistrationClosed`) считаются в коде и не пишутся в БД.
- Для медиа используется единая таблица `media`:
  - `owner_id` — владелец медиа;
  - `target_type` — тип сущности (`item` или `event`);
  - `target_id` — UUID сущности;
  - `url`, `type`, `sort_order`.
- API для вещей и событий использует единый контракт поля `media`:
  - массив `{ id, url, type, sortOrder }`;
  - на update при переданном `media` список заменяется целиком.
