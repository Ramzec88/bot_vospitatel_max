import { getAdminStats } from '../database/db.js';
import { ADMIN_IDS, CONTENT_TYPE_LABELS } from '../config.js';
import { exitKeyboard } from '../utils/keyboard.js';

export async function handleAnalytics(ctx) {
  const userId = ctx.user?.user_id;

  console.log(`[admin] userId="${userId}" type=${typeof userId} ADMIN_IDS=${JSON.stringify(ADMIN_IDS)}`);

  if (!ADMIN_IDS.includes(String(userId))) {
    await ctx.reply(`⛔ Нет доступа. Ваш ID: ${userId}`);
    return;
  }

  const stats = await getAdminStats();

  const tierLines = stats.byTier.map(
    (row) => `  • ${row.tier}: ${row.cnt}`,
  ).join('\n');

  const typeLines = stats.genByType.map(
    (row) => `  • ${CONTENT_TYPE_LABELS[row.content_type] ?? row.content_type}: ${row.cnt}`,
  ).join('\n') || '  нет данных';

  const text =
    `📈 *Аналитика MAX-бота*\n\n` +
    `👥 Пользователей всего: ${stats.totalUsers}\n` +
    `По тарифам:\n${tierLines || '  нет данных'}\n\n` +
    `⚡ Генераций сегодня: ${stats.genToday}\n` +
    `📅 Генераций в этом месяце: ${stats.genMonth}\n` +
    `По типам (месяц):\n${typeLines}`;

  await ctx.reply(text, { attachments: [exitKeyboard()], format: 'markdown' });
}
