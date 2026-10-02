/**
 * Phone number helpers.
 *
 * Comparison uses the last 10 digits so "+1 (415) 555-1234" and "4155551234"
 * match, but refuses to match anything shorter than 7 digits — otherwise an
 * empty/"anonymous" caller ID would match every contact via endsWith('').
 */

const MIN_DIGITS = 7;

export const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export function digits(phone) {
  return typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
}

export function phonesMatch(a, b) {
  const da = digits(a);
  const db = digits(b);
  if (da.length < MIN_DIGITS || db.length < MIN_DIGITS) return false;
  return da.slice(-10) === db.slice(-10);
}

export function findByPhone(list, phone, key = 'phoneNumber') {
  return (list || []).find(item => phonesMatch(typeof item === 'string' ? item : item?.[key], phone)) || null;
}

export function isValidE164(phone) {
  return typeof phone === 'string' && E164_REGEX.test(phone);
}
