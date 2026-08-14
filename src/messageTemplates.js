function normalizeGender(value) {
  return String(value || '').trim().toLowerCase();
}

function getArrivingCount(guest, column) {
  const value = guest[column];
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  return Number(value);
}

function buildGenderGreeting(fullName, gender) {
  const name = String(fullName || '').trim();
  const normalizedGender = normalizeGender(gender);

  if (normalizedGender === 'x') {
    return { greeting: `${name} היקרים,`, invitePronoun: 'אתכם' };
  }
  if (normalizedGender === 'm') {
    return { greeting: `${name} היקר,`, invitePronoun: 'אותך' };
  }
  if (normalizedGender === 'f') {
    return { greeting: `${name} היקרה,`, invitePronoun: 'אותך' };
  }

  throw new Error(`Unknown gender value "${gender}" (expected x/m/f).`);
}

function validateGuest({ fullName, id }) {
  const name = String(fullName || '').trim();
  if (!name) {
    throw new Error('Guest is missing a full_name.');
  }
  if (!id) {
    throw new Error('Guest is missing an id.');
  }
  return name;
}

const MESSAGE_SIGNATURE = ['נתראה  🤍', 'שקד ואיל'];

function buildInvitationMessage(guest, config) {
  const name = validateGuest(guest);
  const { greeting, invitePronoun } = buildGenderGreeting(name, guest.gender);
  const { dayName, date, venueText, rsvpBaseUrl } = config.event;
  const rsvpLink = `${rsvpBaseUrl}${guest.id}`;

  const textMessage = [
    greeting,
    `אנחנו מתרגשים במיוחד להזמין ${invitePronoun} לחתונה שלנו 💍`,
    `האירוע ייערך ביום ${dayName} | ${date} | ${venueText}`,
    '',
    ...MESSAGE_SIGNATURE,
    '',
    'להזמנה ואישור הגעה לחצו  👇 ',
  ].join('\n');

  return { textMessage, linkMessage: rsvpLink };
}

function buildRsvpReminderMessage(guest, config) {
  const name = validateGuest(guest);
  const { rsvpBaseUrl } = config.event;
  const rsvpLink = `${rsvpBaseUrl}${guest.id}`;

  const textMessage = [
    `${name} ,`,
    'רק תזכורת קטנה להשלים את אישור ההגעה לחתונה שלנו 🤍',
    'נשמח שתעדכנו אם תוכלו להגיע וכמה אורחים מגיעים, כדי שנוכל להיערך בהתאם.',
    '',
    ...MESSAGE_SIGNATURE,
    '',
    'לאישור הגעה 👇',
  ].join('\n');

  return { textMessage, linkMessage: rsvpLink };
}

function buildCountdownMessage(guest, config) {
  const name = validateGuest(guest);
  const { greeting } = buildGenderGreeting(name, guest.gender);
  const { dayName, date, venueText, rsvpBaseUrl } = config.event;
  const rsvpLink = `${rsvpBaseUrl}${guest.id}`;

  const textMessage = [
    greeting,
    'זה כבר ממש מתקרב! 💍',
    `מחכים לחגוג איתכם ביום ${dayName} • ${date} • ${venueText}`,
    '',
    ...MESSAGE_SIGNATURE,
    '',
    'לכל הפרטים, ניווט ועדכון אישור ההגעה 👇',
  ].join('\n');

  return { textMessage, linkMessage: rsvpLink };
}

function buildDayOfMessage(guest, config) {
  validateGuest(guest);
  const { giftLink } = config.event;

  const textMessage = [
    'משפחה יקרה, חברים אהובים, אנחנו כבר מתרגשים מאוד לקראת האירוע ומקווים שגם אתם! 🤍',
    'ניפגש היום בלאגו - תל אביב בשעה 19:30.',
    '',
    ...MESSAGE_SIGNATURE,
    '',
    'לנוחיותכם ניתן להעניק מתנה גם דרך פייבוקס בקישור 👇',
  ].join('\n');

  return { textMessage, linkMessage: giftLink };
}

const MESSAGE_TEMPLATES = [
  {
    id: 'invitation',
    label: 'Initial invitation (sms_count = 0)',
    description:
      'First-time wedding invite with event details + RSVP link. Sent only to guests who have never been messaged.',
    matchesGuest(guest, columns) {
      return Number(guest[columns.smsCount] || 0) === 0;
    },
    markSent: true,
    buildMessage: buildInvitationMessage,
  },
  {
    id: 'rsvp-reminder',
    label: 'RSVP reminder (guests_amount_arriving = 0)',
    description:
      'Gentle nudge to complete RSVP and confirm how many guests are coming. Sent only to guests who have not confirmed yet.',
    matchesGuest(guest, columns) {
      return getArrivingCount(guest, columns.guestsAmountArriving) === 0;
    },
    markSent: false,
    buildMessage: buildRsvpReminderMessage,
  },
  {
    id: 'countdown',
    label: 'Countdown message (guests_amount_arriving >= 0)',
    description:
      '"It\'s almost here!" excitement message with event date/venue + RSVP link. Sent to all guests (including those who haven\'t confirmed).',
    matchesGuest(guest, columns) {
      return getArrivingCount(guest, columns.guestsAmountArriving) >= 0;
    },
    markSent: false,
    buildMessage: buildCountdownMessage,
  },
  {
    id: 'day-of',
    label: 'Day-of message (guests_amount_arriving > 0)',
    description:
      'Day-of-event message: meet at Lago Tel Aviv at 19:30 + Paybox gift link. Sent only to guests who confirmed they are coming.',
    matchesGuest(guest, columns) {
      return getArrivingCount(guest, columns.guestsAmountArriving) > 0;
    },
    markSent: false,
    buildMessage: buildDayOfMessage,
  },
];

function getMessageTemplates() {
  return MESSAGE_TEMPLATES;
}

function getMessageTemplateById(id) {
  const template = MESSAGE_TEMPLATES.find((item) => item.id === id);
  if (!template) {
    throw new Error(`Unknown message template "${id}".`);
  }
  return template;
}

module.exports = {
  getMessageTemplates,
  getMessageTemplateById,
  getArrivingCount,
  normalizeGender,
};
