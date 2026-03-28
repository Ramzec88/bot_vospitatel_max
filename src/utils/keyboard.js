import { Keyboard } from '@maxhub/max-bot-api';
import { CHANNEL_URL, CHANNEL_NAME } from '../config.js';

/**
 * Главное меню: выбор типа контента + дополнительные кнопки.
 */
export function mainMenuKeyboard() {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('📋 Сценарий',  'type:scenario'),
      Keyboard.button.callback('🎵 Материал',  'type:methodical'),
    ],
    [
      Keyboard.button.callback('🎨 Занятие',   'type:activity'),
      Keyboard.button.callback('🎮 Игра',      'type:game'),
    ],
    [
      Keyboard.button.callback('📊 Мои лимиты', 'cmd:limits'),
      Keyboard.button.callback('ℹ️ Помощь',     'cmd:help'),
    ],
    [
      Keyboard.button.link(`📣 ${CHANNEL_NAME}`, CHANNEL_URL),
    ],
  ]);
}

/**
 * Клавиатура для вопроса с вариантами ответа.
 */
export function questionKeyboard(questionKey, options, skippable = false) {
  const rows = options.map(([label, value]) => [
    Keyboard.button.callback(label, `answer:${questionKey}:${value}`),
  ]);
  if (skippable) {
    rows.push([Keyboard.button.callback('⏭️ Пропустить', `skip:${questionKey}`)]);
  }
  rows.push([Keyboard.button.callback('❌ Отмена', 'cmd:cancel')]);
  return Keyboard.inlineKeyboard(rows);
}

/**
 * Кнопки возврата в главное меню и подписки на канал.
 */
export function exitKeyboard() {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback('🔙 Главное меню', 'cmd:start')],
    [Keyboard.button.link(`📣 ${CHANNEL_NAME}`, CHANNEL_URL)],
  ]);
}
