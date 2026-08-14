// Template copy of settings.js - contains no real details.
// If settings.js is deleted by mistake, copy this file again as settings.js.
module.exports = {
  supabase: {
    url: 'https://xxxxxxxxxxxx.supabase.co',
    serviceKey: 'your-secret-key',
    table: 'guests',
    columns: {
      id: 'id',
      fullName: 'full_name',
      phone: 'phone_number',
      gender: 'gender',
      smsCount: 'sms_count',
      guestsAmountArriving: 'guests_amount_arriving',
    },
  },
  event: {
    dayName: 'שלישי',
    date: '10/11/26',
    venueText: 'באיסט - east',
    rsvpBaseUrl: 'https://eyal-shaked-wedding.com/?id=',
    giftLink: 'https://eyal-shaked-wedding.com/Details',
  },
  whatsapp: {
    sessionDir: './whatsapp-session',
    headless: false,
  },
  delays: {
    minMs: 15000,
    maxMs: 30000,
    typeMinMs: 40,
    typeMaxMs: 140,
    longBreak: {
      everyMin: 10,
      everyMax: 15,
      minMs: 30000,
      maxMs: 90000,
    },
  },
};
