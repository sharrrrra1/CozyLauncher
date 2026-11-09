/**
 * Утилиты для форматирования времени и других общих функций.
 */

/**
 * Форматирует миллисекунды в читаемую строку с русской плюрализацией.
 * Показываем только часы и минуты — как в профиле Steam.
 * Примеры:
 *   0 -> "пока ни минуты"
 *   59 минут -> "59 минут"
 *   60 минут -> "1 час"
 *   47 ч 12 м -> "47 часов 12 минут"
 *   1000 часов -> "1000 часов"
 */
export function formatPlaytime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'пока ни минуты'

  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes <= 0) return 'пока ни минуты'

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${minutes} ${pluralize(minutes, 'минута', 'минуты', 'минут')}`
  }
  if (minutes === 0) {
    return `${hours} ${pluralize(hours, 'час', 'часа', 'часов')}`
  }
  return `${hours} ${pluralize(hours, 'час', 'часа', 'часов')} ${minutes} ${pluralize(
    minutes,
    'минута',
    'минуты',
    'минут'
  )}`
}

/**
 * Русская плюрализация для чисел.
 * one — 1 (день, час, минута, секунда)
 * few — 2-4 (дня, часа, минуты, секунды)
 * many — 5-20, 25-30... (дней, часов, минут, секунд)
 */
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100

  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

/**
 * Парсит строку времени в миллисекунды (обратная операция к formatPlaytime).
 * Поддерживает форматы: "1 час 30 минут", "45 минут", "2 дня 3 часа" и т.д.
 */
export function parsePlaytime(str: string): number {
  const regex = /(\d+)\s*(день|дня|дней|час|часа|часов|минута|минуты|минут|секунда|секунды|секунд)/gi
  let totalMs = 0
  let match

  while ((match = regex.exec(str)) !== null) {
    const value = parseInt(match[1], 10)
    const unit = match[2].toLowerCase()

    if (unit.startsWith('ден')) totalMs += value * 24 * 60 * 60 * 1000
    else if (unit.startsWith('час')) totalMs += value * 60 * 60 * 1000
    else if (unit.startsWith('минут')) totalMs += value * 60 * 1000
    else if (unit.startsWith('секунд')) totalMs += value * 1000
  }

  return totalMs
}