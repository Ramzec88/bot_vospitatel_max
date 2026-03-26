import 'dotenv/config';

export const config = {
  botToken: process.env.MAX_BOT_TOKEN,
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  openrouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
  databaseUrl: process.env.DATABASE_URL,
  port: parseInt(process.env.PORT || '3000', 10),
};

export const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)
  .map(Number);

// Лимиты генераций в месяц по тарифу
export const TIER_LIMITS = {
  admin: Infinity,
  premium: 30,
  free: 5,
  none: 0,
};

// Названия типов контента
export const CONTENT_TYPE_LABELS = {
  scenario:   '📋 Сценарий мероприятия',
  methodical: '🎵 Методический материал',
  activity:   '🎨 Занятие',
  game:       '🎮 Игра',
};
