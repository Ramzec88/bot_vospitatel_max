import { setUserTier, getUserTier, addBonusGenerations, recordReferral } from '../database/db.js';
import { mainMenuKeyboard } from '../utils/keyboard.js';
import { TIER_LIMITS, REFERRAL_BONUS, CHANNEL_URL, CHANNEL_NAME } from '../config.js';

const WELCOME_TEXT =
`👋 Добро пожаловать в «Помощник воспитателя»!

Я помогу вам быстро создать:
📋 Сценарий мероприятия
🎵 Методический материал
🎨 Конспект занятия
🎮 Описание игры

📣 Подпишитесь на наш канал, чтобы быть в курсе новостей и получать педагогические материалы:
${CHANNEL_URL}

Выберите тип контента 👇`;

const PAYLOAD_TIERS = {
  premium_access: 'premium',
  free_access: 'free',
};

/**
 * Обрабатывает реферальный payload вида ref_USERID.
 * Возвращает true, если реферал засчитан.
 */
async function processReferral(ctx, referrerId, newUserId) {
  if (!referrerId || referrerId === newUserId) return false;

  const currentTier = await getUserTier(newUserId);
  if (currentTier && currentTier !== 'none') return false; // уже активированный пользователь

  // Устанавливаем free-тариф новому пользователю
  await setUserTier(newUserId, 'free', 'max');

  // Записываем реферала и начисляем бонус (recordReferral вернёт false при дублировании)
  const recorded = await recordReferral(referrerId, newUserId);
  if (!recorded) return false;

  await addBonusGenerations(referrerId, REFERRAL_BONUS);

  // Уведомляем реферера
  try {
    await ctx.api.sendMessageToUser(
      referrerId,
      `🎉 По вашей реферальной ссылке зарегистрировался новый пользователь!\n\n+${REFERRAL_BONUS} генераций добавлено к вашему балансу.`,
    );
  } catch {
    // реферер мог заблокировать бота — не критично
  }

  return true;
}

/**
 * Обработчик события bot_started (первый запуск / переход по диплинку).
 */
export async function handleBotStarted(ctx) {
  const userId = ctx.user?.user_id;
  const payload = ctx.startPayload;

  if (userId && payload) {
    if (PAYLOAD_TIERS[payload]) {
      const newTier = PAYLOAD_TIERS[payload];
      await setUserTier(userId, newTier, 'max');
      ctx.tier = newTier;
      ctx.limit = TIER_LIMITS[newTier];
    } else if (payload.startsWith('ref_')) {
      const referrerId = parseInt(payload.slice(4), 10);
      if (!isNaN(referrerId)) {
        const activated = await processReferral(ctx, referrerId, userId);
        if (activated) {
          ctx.tier = 'free';
          ctx.limit = TIER_LIMITS['free'];
        }
      }
    }
  }

  // Если тариф ещё не установлен — автоматически даём бесплатный
  if (userId && (!ctx.tier || ctx.tier === 'none')) {
    const currentTier = await getUserTier(userId);
    if (!currentTier || currentTier === 'none') {
      await setUserTier(userId, 'free', 'max');
    }
    ctx.tier = 'free';
    ctx.limit = TIER_LIMITS['free'];
  }

  await handleStart(ctx);
}

/**
 * Обработчик команды /start (в том числе /start payload из deeplink).
 */
export async function handleStartCommand(ctx) {
  const userId = ctx.user?.user_id;
  const text = ctx.message?.body?.text ?? '';
  const parts = text.trim().split(/\s+/);
  const payload = parts[1];

  if (userId && payload) {
    if (PAYLOAD_TIERS[payload]) {
      const newTier = PAYLOAD_TIERS[payload];
      await setUserTier(userId, newTier, 'max');
      ctx.tier = newTier;
      ctx.limit = TIER_LIMITS[newTier];
    } else if (payload.startsWith('ref_')) {
      const referrerId = parseInt(payload.slice(4), 10);
      if (!isNaN(referrerId)) {
        const activated = await processReferral(ctx, referrerId, userId);
        if (activated) {
          ctx.tier = 'free';
          ctx.limit = TIER_LIMITS['free'];
        }
      }
    }
  }

  await handleStart(ctx);
}

/**
 * Отправляет главное меню.
 */
export async function handleStart(ctx) {
  await ctx.reply(WELCOME_TEXT, { attachments: [mainMenuKeyboard()] });
}
