/**
 * Birthdays are stored day + month only (no year), as a "DD.MM" text value.
 * A player wears a laurel wreath for one week starting on their birthday.
 */

export type DayMonth = { day: number; month: number }

/** Accepts "14.07", "14.07.", "4.7" → { day, month }; invalid → null. */
export function parseBirthday(value: string | null | undefined): DayMonth | null {
  if (!value) return null
  const m = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.?$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return { day, month }
}

/** Canonical stored form, e.g. "14.07" (or null when invalid/empty). */
export function normalizeBirthday(value: string | null | undefined): string | null {
  const p = parseBirthday(value)
  return p ? `${String(p.day).padStart(2, '0')}.${String(p.month).padStart(2, '0')}` : null
}

/** Display form with trailing dot, e.g. "14.07." (empty string when unset). */
export function formatBirthday(value: string | null | undefined): string {
  const p = parseBirthday(value)
  return p ? `${String(p.day).padStart(2, '0')}.${String(p.month).padStart(2, '0')}.` : ''
}

/**
 * Progressive input mask so a numeric keypad (no dot key) is enough:
 * the dot is inserted automatically, e.g. "1407" → "14.07".
 */
export function maskBirthdayInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}.${digits.slice(2)}`
}

/**
 * True during the 7-day window that starts on the player's birthday
 * (birthday itself + the following 6 days), year-agnostic and wrap-safe.
 */
export function isBirthdayWeek(value: string | null | undefined, now: Date = new Date()): boolean {
  const p = parseBirthday(value)
  if (!p) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let bday = new Date(now.getFullYear(), p.month - 1, p.day)
  // Birthday not yet reached this year → the recent occurrence was last year.
  if (bday.getTime() > today.getTime()) bday = new Date(now.getFullYear() - 1, p.month - 1, p.day)
  const days = Math.round((today.getTime() - bday.getTime()) / 86_400_000)
  return days >= 0 && days <= 6
}
