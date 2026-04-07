import { Keyboard } from '@maxhub/max-bot-api';
import { getAdminStats, getRecentGenerations } from '../database/db.js';
import { ADMIN_IDS, CONTENT_TYPE_LABELS } from '../config.js';
import { exitKeyboard } from '../utils/keyboard.js';

function adminGuard(userId) {
  return ADMIN_IDS.includes(String(userId));
}

function analyticsKeyboard() {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback('📋 Последние запросы', 'admin:logs:0')],
    [Keyboard.button.callback('🔙 Главное меню', 'cmd:start')],
  ]);
}

function logsKeyboard(offset) {
  const buttons = [];
  if (offset > 0) {
    buttons.push(Keyboard.button.callback('◀️ Предыдущие', `admin:logs:${offset - 20}`));
  }
  buttons.push(Keyboard.button.callback('▶️ Следующие', `admin:logs:${offset + 20}`));
  return Keyboard.inlineKeyboard([
    buttons,
    [Keyboard.button.callback('📈 Статистика', 'admin:stats')],
    [Keyboard.button.callback('🔙 Главное меню', 'cmd:start')],
  ]);
}

export async function handleAnalytics(ctx) {
  const userId = ctx.user?.user_id;

  console.log(`[admin] userId="${userId}" type=${typeof userId} ADMIN_IDS=${JSON.stringify(ADMIN_IDS)}`);

  if (!adminGuard(userId)) {
    await ctx.reply(`⛔ Нет доступа. Ваш ID: ${userId}`);
    return;
  }

  await sendAnalytics(ctx);
}

export async function sendAnalytics(ctx) {
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

  await ctx.reply(text, { attachments: [analyticsKeyboard()], format: 'markdown' });
}

export async function handleAdminLogs(ctx, offset) {
  const userId = ctx.user?.user_id;
  if (!adminGuard(userId)) return;

  const rows = await getRecentGenerations(offset, 20);

  if (rows.length === 0) {
    await ctx.reply('Нет данных для отображения.', { attachments: [exitKeyboard()] });
    return;
  }

  const lines = rows.map((r, i) => {
    const date = new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const type = CONTENT_TYPE_LABELS[r.content_type] ?? r.content_type;
    return `${offset + i + 1}. [${date}] user ${r.user_id} (${r.tier ?? '?'}) — ${type}`;
  });

  const text = `📋 *Запросы #${offset + 1}–${offset + rows.length}*\n\n` + lines.join('\n');

  // Разбиваем если > 3800 символов
  if (text.length <= 3800) {
    await ctx.reply(text, { attachments: [logsKeyboard(offset)], format: 'markdown' });
  } else {
    const chunks = splitText(text, 3800);
    for (let i = 0; i < chunks.length - 1; i++) {
      await ctx.reply(chunks[i], { format: 'markdown' });
    }
    await ctx.reply(chunks[chunks.length - 1], { attachments: [logsKeyboard(offset)], format: 'markdown' });
  }
}

function splitText(text, maxLen) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > maxLen) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
