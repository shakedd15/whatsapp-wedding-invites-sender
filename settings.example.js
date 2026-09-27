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
    minMs: 61000,
    maxMs: 120000,
    typeMinMs: 40,
    typeMaxMs: 140,
    hourlyBreak: {
      everyGuests: 10,
      durationMs: 3600000,
    },
  },

  sms019: {
    username: 'your-019-username',
    token: 'your-019-api-token',
    source: 'your-approved-sender-name',
  },
};
