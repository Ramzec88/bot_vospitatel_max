import { getUsageThisMonth } from '../database/db.js';
import { exitKeyboard } from '../utils/keyboard.js';
import { TIER_LIMITS } from '../config.js';

const TIER_NAMES = {
  admin:   '👑 Администратор',
  premium: '⭐ Премиум',
  free:    '🆓 Базовый',
  none:    '🔒 Нет доступа',
};

export async function handleLimits(ctx) {
  const userId = ctx.user?.user_id;
  const tier = ctx.tier ?? 'none';
  const limit = TIER_LIMITS[tier] ?? 0;

  const used = await getUsageThisMonth(userId);
  const remaining = limit === Infinity ? '∞' : Math.max(0, limit - used);
  const limitStr = limit === Infinity ? '∞' : String(limit);

  const text =
    `📊 *Ваши лимиты*\n\n` +
    `Тариф: ${TIER_NAMES[tier] ?? tier}\n` +
    `Использовано в этом месяце: ${used} из ${limitStr}\n` +
    `Осталось: ${remaining}`;

  await ctx.reply(text, { attachments: [exitKeyboard()] });
}
