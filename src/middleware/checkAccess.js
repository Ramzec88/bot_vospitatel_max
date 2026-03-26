import { ADMIN_IDS, TIER_LIMITS } from '../config.js';
import { getUserTier, createOrUpdateUser } from '../database/db.js';

export async function checkAccess(ctx, next) {
  const userId = ctx.user?.user_id;
  if (!userId) return next();

  // bot_started и /start пропускаем без проверки — deeplink должен сработать первым
  if (ctx.update?.update_type === 'bot_started') {
    return next();
  }
  const msgText = ctx.message?.body?.text ?? '';
  if (msgText.startsWith('/start')) {
    return next();
  }

  // Администраторы — без ограничений
  if (ADMIN_IDS.includes(userId)) {
    ctx.tier = 'admin';
    ctx.limit = Infinity;
    return next();
  }

  // Убеждаемся, что пользователь есть в БД
  await createOrUpdateUser(userId, 'max');

  const tier = (await getUserTier(userId)) ?? 'none';
  ctx.tier = tier;
  ctx.limit = TIER_LIMITS[tier] ?? 0;

  if (tier === 'none') {
    try {
      await ctx.reply(
        '👋 Для доступа к боту подпишитесь на наш канал и нажмите кнопку «Открыть бота» в закреплённом посте.\n\n' +
          'Если вы уже подписаны — перейдите по ссылке из закреплённого поста ещё раз.',
      );
    } catch (err) {
      console.warn('[checkAccess] Не удалось отправить сообщение:', err?.response?.message ?? err?.message);
    }
    return; // не вызываем next()
  }

  return next();
}
