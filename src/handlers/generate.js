import { generateContent } from '../services/openrouter.js';
import { getUsageThisMonth, incrementUsage, getBonusGenerations } from '../database/db.js';
import { questionKeyboard, exitKeyboard, mainMenuKeyboard } from '../utils/keyboard.js';
import { CONTENT_TYPE_LABELS, CHANNEL_URL, CHANNEL_NAME } from '../config.js';

// FSM: хранилище состояний пользователей в памяти
// { userId -> { state, contentType, ageGroup, groupSize } }
const sessions = new Map();

const STATES = {
  IDLE: 'idle',
  WAITING_AGE_GROUP: 'waiting_age_group',
  WAITING_GROUP_SIZE: 'waiting_group_size',
  WAITING_DESCRIPTION: 'waiting_description',
  GENERATING: 'generating',
};

const AGE_GROUP_OPTIONS = [
  ['👶 3–4 года', '3-4 года'],
  ['🧒 4–5 лет', '4-5 лет'],
  ['🧒 5–6 лет', '5-6 лет'],
  ['🧑 6–7 лет', '6-7 лет'],
];

const GROUP_SIZE_OPTIONS = [
  ['👤 Малая (до 10)', 'малая (до 10 детей)'],
  ['👥 Средняя (10–20)', 'средняя (10–20 детей)'],
  ['👪 Большая (20+)', 'большая (более 20 детей)'],
];

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { state: STATES.IDLE });
  }
  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.set(userId, { state: STATES.IDLE });
}

/**
 * Шаг 1: пользователь выбрал тип контента.
 */
export async function handleTypeSelect(ctx, contentType) {
  const userId = ctx.user?.user_id;
  const session = getSession(userId);

  session.contentType = contentType;
  session.state = STATES.WAITING_AGE_GROUP;

  const label = CONTENT_TYPE_LABELS[contentType] ?? contentType;
  await ctx.reply(
    `Вы выбрали: ${label}\n\nВыберите возрастную группу:`,
    { attachments: [questionKeyboard('ageGroup', AGE_GROUP_OPTIONS, false)] },
  );
}

/**
 * Обработчик входящих callback-нажатий (message_callback).
 * Разбирает payload и направляет в нужный FSM-шаг.
 */
export async function handleCallback(ctx) {
  const userId = ctx.user?.user_id;
  const data = ctx.callback?.payload;
  if (!data || typeof data !== 'string') return;

  const session = getSession(userId);

  // answer:questionKey:value
  if (data.startsWith('answer:')) {
    const parts = data.split(':');
    const questionKey = parts[1];
    const value = parts.slice(2).join(':');
    await handleAnswer(ctx, session, questionKey, value);
    return;
  }

  // skip:questionKey
  if (data.startsWith('skip:')) {
    const questionKey = data.split(':')[1];
    await handleAnswer(ctx, session, questionKey, null);
    return;
  }

  // type:contentType
  if (data.startsWith('type:')) {
    const contentType = data.split(':')[1];
    await handleTypeSelect(ctx, contentType);
    return;
  }

  // admin:logs:offset
  if (data.startsWith('admin:logs:')) {
    const offset = parseInt(data.split(':')[2] ?? '0', 10);
    const { handleAdminLogs } = await import('./admin.js');
    await handleAdminLogs(ctx, offset);
    return;
  }

  // admin:stats
  if (data === 'admin:stats') {
    const { sendAnalytics } = await import('./admin.js');
    await sendAnalytics(ctx);
    return;
  }

  // cmd:*
  if (data.startsWith('cmd:')) {
    const cmd = data.split(':')[1];
    if (cmd === 'cancel') {
      await handleCancel(ctx);
    } else if (cmd === 'start') {
      clearSession(userId);
      await ctx.reply('Главное меню:', { attachments: [mainMenuKeyboard()] });
    } else if (cmd === 'limits') {
      // Делегируем в limits handler — импортируем динамически, чтобы избежать цикла
      const { handleLimits } = await import('./limits.js');
      await handleLimits(ctx);
    } else if (cmd === 'help') {
      await ctx.reply(
        `ℹ️ *Помощник воспитателя*\n\nВыберите тип контента в меню, ответьте на несколько вопросов — и получите готовый материал.\n\n` +
          `/start — главное меню\n/limits — ваши лимиты\n/referral — реферальная ссылка\n/cancel — отменить генерацию\n\n` +
          `📣 Наш канал с педагогическими материалами:\n${CHANNEL_URL}`,
        { format: 'markdown' },
      );
    }
    return;
  }
}

/**
 * Внутренний обработчик ответа на вопрос FSM.
 */
async function handleAnswer(ctx, session, questionKey, value) {
  const userId = ctx.user?.user_id;

  if (session.state === STATES.WAITING_AGE_GROUP && questionKey === 'ageGroup') {
    session.ageGroup = value ?? 'не указано';
    session.state = STATES.WAITING_GROUP_SIZE;
    await ctx.reply(
      'Выберите размер группы:',
      { attachments: [questionKeyboard('groupSize', GROUP_SIZE_OPTIONS, true)] },
    );
    return;
  }

  if (session.state === STATES.WAITING_GROUP_SIZE && questionKey === 'groupSize') {
    session.groupSize = value;
    session.state = STATES.WAITING_DESCRIPTION;
    await ctx.reply(
      '✏️ Опишите задачу подробнее.\n\nНапример: «Весенний утренник, тема — природа просыпается» или «Игра на развитие внимания».\n\nНапишите ваш запрос:',
    );
    return;
  }
}

/**
 * Обработчик текстового описания (свободный ввод пользователя).
 */
export async function handleDescription(ctx) {
  const userId = ctx.user?.user_id;
  const session = getSession(userId);

  if (session.state !== STATES.WAITING_DESCRIPTION) return;

  const description = ctx.message?.body?.text;
  if (!description) return;

  // Проверяем лимит (базовый + бонус от рефералов)
  const [used, bonus] = await Promise.all([
    getUsageThisMonth(userId),
    getBonusGenerations(userId),
  ]);
  const baseLimit = ctx.limit ?? 0;
  const limit = baseLimit === Infinity ? Infinity : baseLimit + bonus;

  if (limit !== Infinity && used >= limit) {
    await ctx.reply(
      `⛔ Вы исчерпали лимит генераций на этот месяц (${limit} шт.).\n\n` +
        'Для увеличения лимита подпишитесь на наш премиум-канал.',
      { attachments: [exitKeyboard()] },
    );
    clearSession(userId);
    return;
  }

  session.state = STATES.GENERATING;
  await ctx.reply('⏳ Генерирую материал, подождите...');

  try {
    const result = await generateContent({
      contentType: session.contentType,
      ageGroup: session.ageGroup,
      groupSize: session.groupSize,
      description,
    });

    await incrementUsage(userId, session.contentType, 'max');

    const remaining = limit === Infinity ? '∞' : limit - used - 1;
    const footer = `\n\n─────────────────\n📊 Использовано: ${used + 1}/${limit === Infinity ? '∞' : limit} • Осталось: ${remaining}`;

    // MAX ограничивает сообщение 4000 символами — разбиваем на части
    const MAX_LEN = 3800;
    const full = result + footer;

    if (full.length <= MAX_LEN) {
      await ctx.reply(full, { attachments: [exitKeyboard()] });
    } else {
      // Отправляем текст частями, клавиатура — в последней
      const chunks = [];
      let remaining_text = result;
      while (remaining_text.length > MAX_LEN) {
        let cut = remaining_text.lastIndexOf('\n', MAX_LEN);
        if (cut < MAX_LEN / 2) cut = MAX_LEN;
        chunks.push(remaining_text.slice(0, cut));
        remaining_text = remaining_text.slice(cut).trimStart();
      }
      chunks.push(remaining_text);

      for (let i = 0; i < chunks.length - 1; i++) {
        await ctx.reply(chunks[i]);
      }
      await ctx.reply(chunks[chunks.length - 1] + footer, { attachments: [exitKeyboard()] });
    }
  } catch (err) {
    console.error('Ошибка генерации:', err.message);
    await ctx.reply(
      '❌ Произошла ошибка при генерации. Попробуйте позже.',
      { attachments: [exitKeyboard()] },
    );
  } finally {
    clearSession(userId);
  }
}

/**
 * Отмена текущей генерации.
 */
export async function handleCancel(ctx) {
  const userId = ctx.user?.user_id;
  clearSession(userId);
  await ctx.reply('Генерация отменена.', { attachments: [mainMenuKeyboard()] });
}
