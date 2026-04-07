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

  // Таблица рефералов
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_id BIGINT NOT NULL,
      referred_id BIGINT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Миграция: добавляем колонки, если их нет
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_generations INT NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE generations ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';`);
  await pool.query(`ALTER TABLE generations ADD COLUMN IF NOT EXISTS description TEXT;`);

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
    `INSERT INTO users (user_id, tier, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id)
     DO UPDATE SET tier = $2`,
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
export async function incrementUsage(userId, contentType, platform = 'max', description = null) {
  await pool.query(
    'INSERT INTO generations (user_id, content_type, platform, description) VALUES ($1, $2, $3, $4)',
    [userId, contentType, platform, description],
  );
}

/**
 * Возвращает накопленный бонус генераций пользователя.
 */
export async function getBonusGenerations(userId) {
  const { rows } = await pool.query(
    'SELECT bonus_generations FROM users WHERE user_id = $1',
    [userId],
  );
  return parseInt(rows[0]?.bonus_generations ?? '0', 10);
}

/**
 * Добавляет бонусные генерации пользователю.
 */
export async function addBonusGenerations(userId, amount) {
  await pool.query(
    `UPDATE users SET bonus_generations = bonus_generations + $2 WHERE user_id = $1`,
    [userId, amount],
  );
}

/**
 * Записывает реферала и возвращает true, если запись прошла успешно.
 * Возвращает false, если referred_id уже был реферирован.
 */
export async function recordReferral(referrerId, referredId) {
  const { rowCount } = await pool.query(
    `INSERT INTO referrals (referrer_id, referred_id)
     VALUES ($1, $2)
     ON CONFLICT (referred_id) DO NOTHING`,
    [referrerId, referredId],
  );
  return rowCount > 0;
}

/**
 * Возвращает количество приглашённых пользователей.
 */
export async function getReferralCount(userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS cnt FROM referrals WHERE referrer_id = $1',
    [userId],
  );
  return parseInt(rows[0]?.cnt ?? '0', 10);
}

/**
 * Возвращает последние генерации для администраторов (пагинация по 20).
 */
export async function getRecentGenerations(offset = 0, limit = 20) {
  const { rows } = await pool.query(
    `SELECT g.id, g.user_id, g.content_type, g.description, g.created_at,
            u.tier
     FROM generations g
     LEFT JOIN users u ON u.user_id = g.user_id
     WHERE g.platform = 'max'
     ORDER BY g.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
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
