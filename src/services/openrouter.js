import axios from 'axios';
import { config, CONTENT_TYPE_LABELS } from '../config.js';

const SYSTEM_PROMPTS = {
  scenario: `Ты — опытный методист дошкольного образования.
Напиши подробный сценарий мероприятия для детского сада.
Структура: цель, оборудование, ход мероприятия (вступление, основная часть, финал).
Язык — профессиональный, доступный воспитателям. Объём — 400–600 слов.`,

  methodical: `Ты — опытный методист дошкольного образования.
Создай методический материал (конспект занятия, методические рекомендации или дидактическое пособие).
Структура: цель, задачи, материалы, описание.
Объём — 400–600 слов.`,

  activity: `Ты — опытный воспитатель детского сада.
Разработай подробный план занятия для детей.
Структура: тема, цель, задачи (обучающие, развивающие, воспитательные), оборудование, ход занятия.
Объём — 400–600 слов.`,

  game: `Ты — опытный воспитатель детского сада.
Придумай интересную игру для детей (подвижная, дидактическая или ролевая).
Структура: название, цель, оборудование, правила, ход игры, варианты усложнения.
Объём — 300–500 слов.`,
};

/**
 * Генерирует педагогический контент через OpenRouter.
 */
export async function generateContent({ contentType, ageGroup, groupSize, description }) {
  const systemPrompt = SYSTEM_PROMPTS[contentType] ?? SYSTEM_PROMPTS.activity;

  const userMessage = [
    `Тип контента: ${CONTENT_TYPE_LABELS[contentType] ?? contentType}`,
    `Возрастная группа: ${ageGroup}`,
    groupSize ? `Размер группы: ${groupSize}` : null,
    `Описание задачи от воспитателя: ${description}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: config.openrouterModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    },
    {
      headers: {
        Authorization: `Bearer ${config.openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/pomoshnik-max',
        'X-Title': 'Помощник воспитателя MAX',
      },
      timeout: 60_000,
    },
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Пустой ответ от OpenRouter');
  return text.trim();
}
