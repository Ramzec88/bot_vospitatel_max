import { Keyboard } from '@maxhub/max-bot-api';

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
  ]);
}

/**
 * Клавиатура для вопроса с вариантами ответа.
 * @param {string} questionKey  — ключ вопроса (напр. 'ageGroup')
 * @param {Array<[string, string]>} options — пары [label, value]
 * @param {boolean} skippable   — показывать ли кнопку «Пропустить»
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
 * Кнопка возврата в главное меню.
 */
export function exitKeyboard() {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback('🔙 Главное меню', 'cmd:start')],
  ]);
}
