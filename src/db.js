const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',        // имя пользователя Postgres
  password: 'Huaweihonor1212', // пароль, который задавал при установке
  database: 'rent_app',    // имя базы
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { query };