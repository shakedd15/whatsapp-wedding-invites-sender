/**
 * The phone_number column holds several numbers in one cell, separated by
 * commas (e.g. "0526139229,0525212364"). This splits and trims them.
 */
function parsePhoneNumbers(raw) {
  return String(raw || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Converts a local Israeli number (e.g. "0526139229") into the international
 * format WhatsApp Web expects ("972526139229"). Numbers that already look
 * international (start with "+" or "972") are left as-is.
 */
function normalizeIsraeliNumber(rawNumber) {
  const digitsOnly = String(rawNumber || '').replace(/[^\d+]/g, '');

  if (digitsOnly.startsWith('+')) {
    return digitsOnly.slice(1);
  }
  if (digitsOnly.startsWith('972')) {
    return digitsOnly;
  }
  if (digitsOnly.startsWith('0')) {
    return `972${digitsOnly.slice(1)}`;
  }
  return digitsOnly;
}

module.exports = { parsePhoneNumbers, normalizeIsraeliNumber };
