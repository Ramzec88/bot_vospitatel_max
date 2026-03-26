import { setUserTier } from '../database/db.js';
import { mainMenuKeyboard } from '../utils/keyboard.js';
import { TIER_LIMITS } from '../config.js';

const WELCOME_TEXT = `👋 Добро пожаловать в «Помощник воспитателя»!

Я помогу вам быстро создать:
📋 Сценарий мероприятия
🎵 Методический материал
🎨 Конспект занятия
🎮 Описание игры

Выберите тип контента 👇`;

const PAYLOAD_TIERS = {
  premium_access: 'premium',
  free_access: 'free',
};

/**
 * Обработчик события bot_started (первый запуск / переход по диплинку).
 */
export async function handleBotStarted(ctx) {
  const userId = ctx.user?.user_id;
  const payload = ctx.startPayload;

  if (userId && payload && PAYLOAD_TIERS[payload]) {
    const newTier = PAYLOAD_TIERS[payload];
    await setUserTier(userId, newTier, 'max');
    // Обновляем ctx.tier, если middleware уже установил его
    ctx.tier = newTier;
    ctx.limit = TIER_LIMITS[newTier];
  }

  await handleStart(ctx);
}

/**
 * Обработчик команды /start.
 */
export async function handleStart(ctx) {
  await ctx.reply(WELCOME_TEXT, { attachments: [mainMenuKeyboard()] });
}
