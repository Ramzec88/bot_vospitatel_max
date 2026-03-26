# 🤖 План реализации: «Помощник воспитателя» для MAX

> **Токен бота:** получен ✅  
> **База данных:** Supabase PostgreSQL (переиспользуем из Telegram-версии)  
> **Стек:** Node.js 20+, `@maxhub/max-bot-api`, `pg`, `axios`, `dotenv`

---

## 📁 Структура проекта

```
pomoshnik-max/
├── src/
│   ├── bot.js                    # точка входа, регистрация обработчиков
│   ├── config.js                 # переменные окружения, константы
│   ├── database/
│   │   └── db.js                 # PostgreSQL — переиспользуем из Telegram-версии
│   ├── handlers/
│   │   ├── start.js              # /start, bot_started
│   │   ├── generate.js           # FSM генерации контента
│   │   ├── limits.js             # показ лимитов
│   │   └── admin.js              # аналитика для админов
│   ├── middleware/
│   │   └── checkAccess.js        # проверка доступа (вместо getChatMember)
│   ├── services/
│   │   └── openrouter.js         # без изменений из Telegram-версии
│   └── utils/
│       └── keyboard.js           # фабрика клавиатур MAX
├── .env
├── .env.example
├── package.json
└── Dockerfile
```

---

## ⚙️ Переменные окружения

```env
# .env
MAX_BOT_TOKEN=f9LHodD0cOLFu_Hzg094z...   # токен MAX-бота
OPENROUTER_API_KEY=sk-or-...               # без изменений
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
DATABASE_URL=postgresql://...              # тот же Supabase
PORT=3000
```

---

## 📦 Шаг 1 — Инициализация

```bash
mkdir pomoshnik-max && cd pomoshnik-max
npm init -y
npm install @maxhub/max-bot-api dotenv pg axios
```

`package.json`:
```json
{
  "type": "module",
  "scripts": {
    "start": "node src/bot.js",
    "dev": "node --watch src/bot.js"
  }
}
```

---

## 🤖 Шаг 2 — `src/bot.js`

Главное отличие от Grammy: обработчики событий через `bot.on('message_callback', ...)` вместо `bot.callbackQuery(...)`.

```js
import { Bot } from '@maxhub/max-bot-api';
import { config } from './config.js';
import { initDatabase } from './database/db.js';
import { handleStart, handleBotStarted } from './handlers/start.js';
import { handleTypeSelect, handleAnswer, handleDescription, handleCancel } from './handlers/generate.js';
import { handleLimits } from './handlers/limits.js';
import { handleAnalytics } from './handlers/admin.js';
import { checkAccess } from './middleware/checkAccess.js';

await initDatabase();
const bot = new Bot(config.botToken);

// Middleware — проверка доступа
bot.use(checkAccess);

// Системные события
bot.on('bot_started', handleBotStarted);   // первый запуск / диплинк
bot.command('start', handleStart);
bot.command('limits', handleLimits);
bot.command('cancel', handleCancel);
bot.command('analytics', handleAnalytics);

// Выбор типа контента через inline-кнопки
bot.action('type:scenario',   (ctx) => handleTypeSelect(ctx, 'scenario'));
bot.action('type:methodical', (ctx) => handleTypeSelect(ctx, 'methodical'));
bot.action('type:activity',   (ctx) => handleTypeSelect(ctx, 'activity'));
bot.action('type:game',       (ctx) => handleTypeSelect(ctx, 'game'));

// Ответы на вопросы (возраст, размер группы и т.д.)
bot.on('message_callback', handleAnswer);

// Текстовые сообщения → описание задачи
bot.on('message_created', async (ctx) => {
  const text = ctx.message?.body?.text;
  if (!text || text.startsWith('/')) return;
  await handleDescription(ctx);
});

bot.start();
console.log('✅ MAX бот «Помощник воспитателя» запущен');
```

---

## 🔑 Шаг 3 — Проверка доступа (`middleware/checkAccess.js`)

### Проблема
В MAX Bot API нет аналога `getChatMember()` — нельзя проверить подписку на канал напрямую из бота.

### Решение: диплинк из приватного канала

Схема работы:

```
Приватный канал MAX
  └─ Закреплённый пост с кнопкой
       └─ Кнопка: "Открыть бота"
            └─ Ссылка: https://max.ru/botNick?start=premium_access
                  └─ bot_started { payload: "premium_access" }
                        └─ Помечаем user_id в БД как premium
```

```js
// middleware/checkAccess.js
import { ADMIN_IDS, TIER_LIMITS } from '../config.js';
import { getUserTier } from '../database/db.js';

export async function checkAccess(ctx, next) {
  const userId = ctx.user?.user_id;
  if (!userId) return;

  // Администраторы — без ограничений
  if (ADMIN_IDS.includes(userId)) {
    ctx.tier = 'admin';
    ctx.limit = Infinity;
    return next();
  }

  // Получаем tier из БД (выдаётся через диплинк)
  const tier = await getUserTier(userId) || 'none';
  ctx.tier = tier;
  ctx.limit = TIER_LIMITS[tier] || 0;

  if (tier === 'none') {
    await ctx.reply(
      '👋 Для доступа к боту подпишитесь на наш канал и нажмите кнопку «Открыть бота».\n\n' +
      'Если вы уже подписаны — перейдите по ссылке из закреплённого поста.'
    );
    return; // не вызываем next()
  }

  return next();
}
```

### Как выдать доступ через диплинк

```js
// handlers/start.js — обработчик bot_started
export async function handleBotStarted(ctx) {
  const userId = ctx.user?.user_id;
  const payload = ctx.payload; // из ?start=...

  if (payload === 'premium_access') {
    await setUserTier(userId, 'premium');
  } else if (payload === 'free_access') {
    await setUserTier(userId, 'free');
  }

  await handleStart(ctx);
}
```

**Ссылки для каналов:**
- Открытый канал → `https://max.ru/botNick?start=free_access`
- Закрытый канал педагогов → `https://max.ru/botNick?start=premium_access`

---

## 🎹 Шаг 4 — Клавиатуры (`utils/keyboard.js`)

> ⚠️ В MAX нет Reply Keyboard (постоянные кнопки под полем ввода). Только inline.  
> Меню выводится кнопками в теле сообщения.

```js
import { Keyboard } from '@maxhub/max-bot-api';

// Главное меню
export function mainMenuKeyboard() {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('📋 Сценарий',  'type:scenario'),
      Keyboard.button.callback('🎵 Песня',     'type:methodical'),
    ],
    [
      Keyboard.button.callback('🎨 Занятие',   'type:activity'),
      Keyboard.button.callback('🎮 Игра',      'type:game'),
    ],
    [
      Keyboard.button.callback('📊 Мои лимиты', 'cmd:limits'),
      Keyboard.button.callback('ℹ️ Помощь',     'cmd:help'),
    ],
  ]);
}

// Вопрос с вариантами ответа
export function questionKeyboard(questionKey, options) {
  const rows = options.map(([label, value]) => [
    Keyboard.button.callback(label, `answer:${questionKey}:${value}`)
  ]);
  // Кнопка пропуска для необязательных вопросов
  if (questionKey !== 'ageGroup') {
    rows.push([Keyboard.button.callback('⏭️ Пропустить', `skip:${questionKey}`)]);
  }
  return Keyboard.inlineKeyboard(rows);
}

// Кнопка выхода из режима поддержки
export function exitKeyboard() {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback('🔙 Главное меню', 'cmd:start')]
  ]);
}
```

---

## 🗄️ Шаг 5 — База данных

Переиспользуем `db-postgres.js` из Telegram-версии **без изменений**.

Добавляем одну миграцию — колонка `platform` для различия источника:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
ALTER TABLE generations ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
```

При создании пользователя в MAX-версии передаём `platform: 'max'`.

---

## 🔄 Шаг 6 — FSM генерации (`handlers/generate.js`)

Логика идентична Telegram-версии. Меняется только:

| Telegram (Grammy) | MAX |
|---|---|
| `ctx.callbackQuery.data` | `ctx.callback?.payload` |
| `ctx.editMessageText(...)` | `ctx.api.raw.patch('messages/{mid}', ...)` |
| `ctx.answerCallbackQuery()` | не требуется явно |
| `InlineKeyboard` (Grammy) | `Keyboard.inlineKeyboard(...)` (MAX) |

---

## 🚀 Шаг 7 — Деплой на Railway

`Dockerfile` (тот же, что и для Telegram-версии):

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
CMD ["node", "src/bot.js"]
```

Переменные окружения в Railway:

| Переменная | Значение |
|---|---|
| `MAX_BOT_TOKEN` | токен из business.max.ru |
| `OPENROUTER_API_KEY` | ключ OpenRouter |
| `DATABASE_URL` | строка Supabase (та же) |

> Webhook для MAX не нужен на старте — Long Polling работает стабильно.  
> Для production можно перейти на Webhook через `POST /subscriptions`.

---

## ✅ Чеклист реализации

- [ ] Инициализировать проект, установить `@maxhub/max-bot-api`
- [ ] Написать `config.js` и `.env`
- [ ] Скопировать `database/db.js` и `services/openrouter.js` из Telegram-версии
- [ ] Написать `utils/keyboard.js` — фабрика inline-клавиатур
- [ ] Написать `middleware/checkAccess.js` — доступ через tier в БД
- [ ] Написать `handlers/start.js` — `/start` + `bot_started` + диплинк-логика
- [ ] Написать `handlers/generate.js` — FSM с адаптацией под MAX callback
- [ ] Написать `handlers/limits.js` — показ лимитов
- [ ] Написать `handlers/admin.js` — аналитика
- [ ] Написать `src/bot.js` — точка входа
- [ ] Добавить SQL-миграцию колонки `platform`
- [ ] Запустить локально (`npm run dev`), проверить `/start`
- [ ] Создать приватный канал в MAX, добавить закреплённый пост с диплинками
- [ ] Задеплоить на Railway

---

## ⏱️ Оценка времени

| Этап | Время |
|---|---|
| Настройка проекта + config | 15 мин |
| keyboard.js + checkAccess.js | 30 мин |
| handlers (start, limits, admin) | 30 мин |
| handlers/generate.js (FSM) | 1 час |
| bot.js + интеграция | 30 мин |
| Тестирование + деплой | 1 час |
| **Итого** | **~3.5 часа** |

---

## 🔮 Что можно добавить позже

- **Webhook-режим** вместо Long Polling для production
- **Мини-приложение «Кладовая педагога»** — подключается к боту через `Keyboard.button.openApp(...)`
- **Автоматическая проверка подписки** — когда MAX добавит `getChatMember` в Bot API
- **Рассылка через канал** — публикация постов через API MAX напрямую
