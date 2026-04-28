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
