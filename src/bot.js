import { Bot } from '@maxhub/max-bot-api';
import { config } from './config.js';
import { initDatabase } from './database/db.js';
import { handleStart, handleStartCommand, handleBotStarted } from './handlers/start.js';
import { handleCallback, handleDescription, handleCancel } from './handlers/generate.js';
import { handleLimits } from './handlers/limits.js';
import { handleAnalytics } from './handlers/admin.js';
import { checkAccess } from './middleware/checkAccess.js';

// Инициализация БД перед стартом
await initDatabase();

const bot = new Bot(config.botToken);

// Middleware — проверка доступа и установка tier/limit в ctx
bot.use(checkAccess);

// Системные события
bot.on('bot_started', handleBotStarted);   // первый запуск / переход по диплинку

// Команды
bot.command(/^start/,    handleStartCommand);
bot.command('limits',    handleLimits);
bot.command('referral',  handleLimits); // реферальная ссылка показывается в /limits
bot.command('cancel',    handleCancel);
bot.command('analytics', handleAnalytics);

// Все нажатия inline-кнопок (callback)
// Библиотека @maxhub/max-bot-api использует событие 'message_callback'
bot.on('message_callback', handleCallback);

// Текстовые сообщения пользователя → описание задачи для генерации
bot.on('message_created', async (ctx) => {
  const text = ctx.message?.body?.text ?? ctx.message?.text;
  if (!text || text.startsWith('/')) return;
  await handleDescription(ctx);
});

// Глобальный обработчик ошибок
bot.catch((err) => {
  console.error('Необработанная ошибка бота:', err);
});

bot.start();
console.log('✅ MAX бот «Помощник воспитателя» запущен');
