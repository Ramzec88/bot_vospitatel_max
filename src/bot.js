import { Bot } from '@maxhub/max-bot-api';
import { config } from './config.js';
import { initDatabase } from './database/db.js';
import { handleStart, handleStartCommand, handleBotStarted } from './handlers/start.js';
import { handleCallback, handleDescription, handleCancel } from './handlers/generate.js';
import { handleLimits } from './handlers/limits.js';
import { handleAnalytics, handleBroadcastGroupLink } from './handlers/admin.js';
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
bot.command('broadcast_group_link', handleBroadcastGroupLink);

// Все нажатия inline-кнопок (callback)
// Библиотека @maxhub/max-bot-api использует событие 'message_callback'
bot.on('message_callback', handleCallback);

// Текстовые сообщения пользователя → описание задачи для генерации
bot.on('message_created', async (ctx) => {
  const text = ctx.message?.body?.text ?? ctx.message?.text;
  if (!text || text.startsWith('/')) return;
  await handleDescription(ctx);
});

// Глобальный обработчик ошибок бота (ошибки внутри обработчиков команд)
bot.catch((err) => {
  console.error('Необработанная ошибка бота:', err);
});

// Сетевые сбои (таймауты соединения с MAX API) не должны ронять процесс —
// иначе Railway пересоздаёт контейнер при каждом временном обрыве сети.
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Необработанный reject (продолжаем работу):', err);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Необработанное исключение (продолжаем работу):', err);
});

// bot.start() держит long-polling цикл. У библиотеки @maxhub/max-bot-api есть баг:
// при временной сетевой ошибке (FetchError, 429, 5xx) Polling.loop делает return
// вместо retry — цикл тихо завершается, bot.start() резолвится без исключения,
// и бот молча перестаёт отвечать. Поэтому перезапускаем цикл при ЛЮБОМ его
// завершении — как по исключению, так и по тихому return.
// bot.stop() обязателен перед повторным bot.start() — иначе флаг pollingIsStarted
// внутри библиотеки не даст циклу перезапуститься.
let running = true;
process.on('SIGTERM', () => { running = false; bot.stop(); });
process.on('SIGINT', () => { running = false; bot.stop(); });

async function startBotWithRetry() {
  console.log('✅ MAX бот «Помощник воспитателя» запущен');
  while (running) {
    try {
      await bot.start();
      if (running) console.warn('⚠️ Polling неожиданно остановился, перезапуск через 3с...');
    } catch (err) {
      console.error('❌ Polling упал с ошибкой, перезапуск через 3с:', err.message);
    }
    if (!running) break;
    bot.stop();
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

startBotWithRetry();
