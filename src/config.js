const path = require('path');
const fs = require('fs');

const settingsPath = path.resolve(__dirname, '..', 'settings.js');

if (!fs.existsSync(settingsPath)) {
  throw new Error(
    'Missing settings.js. Copy settings.example.js to settings.js in the project root and fill in your Supabase details.'
  );
}

const settings = require(settingsPath);

function requireValue(value, label) {
  if (!value || value.startsWith('your-') || value.includes('xxxx')) {
    throw new Error(`Please fill in "${label}" in settings.js with your real Supabase details.`);
  }
  return value;
}

const config = {
  supabase: {
    url: requireValue(settings.supabase?.url, 'supabase.url'),
    serviceKey: requireValue(settings.supabase?.serviceKey, 'supabase.serviceKey'),
    table: settings.supabase?.table || 'guests',
    columns: {
      id: settings.supabase?.columns?.id || 'id',
      fullName: settings.supabase?.columns?.fullName || 'full_name',
      phone: settings.supabase?.columns?.phone || 'phone_number',
      gender: settings.supabase?.columns?.gender || 'gender',
      smsCount: settings.supabase?.columns?.smsCount || 'sms_count',
      guestsAmountArriving: settings.supabase?.columns?.guestsAmountArriving || 'guests_amount_arriving',
    },
  },
  event: {
    dayName: settings.event?.dayName || '',
    date: settings.event?.date || '',
    venueText: settings.event?.venueText || '',
    rsvpBaseUrl: requireValue(settings.event?.rsvpBaseUrl, 'event.rsvpBaseUrl'),
    giftLink: settings.event?.giftLink || '',
  },
  whatsapp: {
    sessionDir: settings.whatsapp?.sessionDir || './whatsapp-session',
    headless: Boolean(settings.whatsapp?.headless),
  },
  delays: {
    minMs: Number(settings.delays?.minMs || 15000),
    maxMs: Number(settings.delays?.maxMs || 30000),
    typeMinMs: Number(settings.delays?.typeMinMs || 40),
    typeMaxMs: Number(settings.delays?.typeMaxMs || 140),
    longBreak: {
      everyMin: Number(settings.delays?.longBreak?.everyMin || 10),
      everyMax: Number(settings.delays?.longBreak?.everyMax || 15),
      minMs: Number(settings.delays?.longBreak?.minMs || 30000),
      maxMs: Number(settings.delays?.longBreak?.maxMs || 90000),
    },
  },
};

module.exports = config;
