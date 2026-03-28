import { getUsageThisMonth, getBonusGenerations, getReferralCount } from '../database/db.js';
import { exitKeyboard } from '../utils/keyboard.js';
import { TIER_LIMITS, REFERRAL_BONUS, CHANNEL_URL, CHANNEL_NAME, config } from '../config.js';

const TIER_NAMES = {
  admin:   '👑 Администратор',
  premium: '⭐ Премиум',
  free:    '🆓 Базовый',
  none:    '🔒 Нет доступа',
};

export async function handleLimits(ctx) {
  const userId = ctx.user?.user_id;
  const tier = ctx.tier ?? 'none';
  const baseLimit = TIER_LIMITS[tier] ?? 0;

  const [used, bonus, referralCount] = await Promise.all([
    getUsageThisMonth(userId),
    getBonusGenerations(userId),
    getReferralCount(userId),
  ]);

  const effectiveLimit = baseLimit === Infinity ? Infinity : baseLimit + bonus;
  const remaining = effectiveLimit === Infinity ? '∞' : Math.max(0, effectiveLimit - used);
  const limitStr = effectiveLimit === Infinity ? '∞' : String(effectiveLimit);

  const referralLink = config.botUsername
    ? `https://max.ru/${config.botUsername}?start=ref_${userId}`
    : '_(добавьте BOT\\_USERNAME в настройки)_';

  const text =
    `📊 *Ваши лимиты*\n\n` +
    `Тариф: ${TIER_NAMES[tier] ?? tier}\n` +
    `Базовый лимит: ${baseLimit === Infinity ? '∞' : baseLimit}\n` +
    (bonus > 0 ? `Бонус от рефералов: +${bonus}\n` : '') +
    `Использовано в этом месяце: ${used} из ${limitStr}\n` +
    `Осталось: ${remaining}\n\n` +
    `👥 *Реферальная программа*\n` +
    `Приглашайте коллег — за каждого вы получаете *+${REFERRAL_BONUS} генераций* навсегда.\n` +
    `Приглашено: ${referralCount} чел.\n\n` +
    `Ваша реферальная ссылка:\n${referralLink}\n\n` +
    `📣 *Наш канал*\n${CHANNEL_NAME}\n${CHANNEL_URL}`;

  await ctx.reply(text, { attachments: [exitKeyboard()], format: 'markdown' });
}
