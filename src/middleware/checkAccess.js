import { ADMIN_IDS, TIER_LIMITS } from '../config.js';
import { getUserTier, setUserTier, createOrUpdateUser } from '../database/db.js';

export async function checkAccess(ctx, next) {
  const userId = ctx.user?.user_id;
  if (!userId) return next();

  // bot_started и /start пропускаем — deeplink должен сработать первым
  if (ctx.update?.update_type === 'bot_started') {
    return next();
  }
  const msgText = ctx.message?.body?.text ?? '';
  if (msgText.startsWith('/start')) {
    return next();
  }

  // Администраторы — без ограничений
  if (ADMIN_IDS.includes(String(userId))) {
    ctx.tier = 'admin';
    ctx.limit = Infinity;
    return next();
  }

  // Убеждаемся, что пользователь есть в БД
  await createOrUpdateUser(userId, 'max');

  let tier = (await getUserTier(userId)) ?? 'none';

  // Новые пользователи автоматически получают бесплатный тариф
  if (tier === 'none') {
    await setUserTier(userId, 'free', 'max');
    tier = 'free';
  }

  ctx.tier = tier;
  ctx.limit = TIER_LIMITS[tier] ?? 0;

  return next();
}
