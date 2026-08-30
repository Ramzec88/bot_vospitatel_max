import { config } from '../config.js';

/**
 * Payload диплинка группы на текущий месяц (например group_2026_05).
 */
export function currentGroupPayload() {
  const now = new Date();
  return `group_${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Проверяет, актуален ли payload диплинка группы (совпадает с текущим месяцем).
 */
export function isValidGroupPayload(payload) {
  return payload === currentGroupPayload();
}

/**
 * Полная действующая ссылка-приглашение в закрытую группу на этот месяц.
 */
export function currentGroupLink() {
  if (!config.botUsername) return null;
  return `https://max.ru/${config.botUsername}?start=${currentGroupPayload()}`;
}
