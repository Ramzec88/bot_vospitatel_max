import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool;

export async function initDatabase() {
  pool = new Pool({ connectionString: config.databaseUrl });

  // Проверяем соединение
  await pool.query('SELECT 1');

  // Создаём таблицы, если их нет
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY,
      tier TEXT NOT NULL DEFAULT 'none',
      platform TEXT NOT NULL DEFAULT 'telegram',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS generations (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      content_type TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'telegram',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Миграция: добавляем колонку platform, если её нет
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
  `);
  await pool.query(`
    ALTER TABLE generations ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
  `);

  console.log('✅ База данных инициализирована');
}

/**
 * Возвращает tier пользователя или null, если пользователь не найден.
 */
export async function getUserTier(userId) {
  const { rows } = await pool.query(
    'SELECT tier FROM users WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.tier ?? null;
}

/**
 * Создаёт или обновляет tier пользователя.
 */
export async function setUserTier(userId, tier, platform = 'max') {
  await pool.query(
    `INSERT INTO users (user_id, tier, platform, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET tier = $2, updated_at = NOW()`,
    [userId, tier, platform],
  );
}

/**
 * Создаёт запись пользователя с tier='none', если её нет.
 */
export async function createOrUpdateUser(userId, platform = 'max') {
  await pool.query(
    `INSERT INTO users (user_id, tier, platform)
     VALUES ($1, 'none', $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, platform],
  );
}

/**
 * Возвращает количество генераций пользователя в текущем месяце.
 */
export async function getUsageThisMonth(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM generations
     WHERE user_id = $1
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
    [userId],
  );
  return parseInt(rows[0]?.cnt ?? '0', 10);
}

/**
 * Записывает новую генерацию.
 */
export async function incrementUsage(userId, contentType, platform = 'max') {
  await pool.query(
    'INSERT INTO generations (user_id, content_type, platform) VALUES ($1, $2, $3)',
    [userId, contentType, platform],
  );
}

/**
 * Возвращает агрегированную статистику для администраторов.
 */
export async function getAdminStats() {
  const { rows: totalUsers } = await pool.query(
    "SELECT COUNT(*) AS cnt FROM users WHERE platform = 'max'",
  );

  const { rows: byTier } = await pool.query(
    `SELECT tier, COUNT(*) AS cnt
     FROM users
     WHERE platform = 'max'
     GROUP BY tier
     ORDER BY tier`,
  );

  const { rows: genToday } = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM generations
     WHERE platform = 'max'
       AND created_at >= CURRENT_DATE`,
  );

  const { rows: genMonth } = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM generations
     WHERE platform = 'max'
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
  );

  const { rows: genByType } = await pool.query(
    `SELECT content_type, COUNT(*) AS cnt
     FROM generations
     WHERE platform = 'max'
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
     GROUP BY content_type
     ORDER BY cnt DESC`,
  );

  return {
    totalUsers: parseInt(totalUsers[0]?.cnt ?? '0', 10),
    byTier,
    genToday: parseInt(genToday[0]?.cnt ?? '0', 10),
    genMonth: parseInt(genMonth[0]?.cnt ?? '0', 10),
    genByType,
  };
}
