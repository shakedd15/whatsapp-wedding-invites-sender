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
    return { greeting: `${name} יקרים,`, invitePronoun: 'אתכם' };
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

function appendRsvpFlag(link) {
  if (/(?:[?&])rsvp=1(?:&|$)/.test(link)) {
    return link;
  }
  return `${link}&rsvp=1`;
}

function buildRsvpReminderMessage(guest, config) {
  const name = validateGuest(guest);
  const { rsvpBaseUrl } = config.event;
  const rsvpLink = appendRsvpFlag(`${rsvpBaseUrl}${guest.id}`);

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
  const isPlural = normalizeGender(guest.gender) === 'x';
  const replyTo = isPlural ? 'אליכם' : 'אליך';
  const hasForYou = isPlural ? 'לכם' : 'לך';
  const { dayName, date, venueText, rsvpBaseUrl } = config.event;
  const rsvpLink = `${rsvpBaseUrl}${guest.id}`;

  const textMessage = [
    greeting,
    'זה כבר ממש מתקרב! 💍',
    `מחכים לחגוג איתכם ביום ${dayName} • ${date} • ${venueText}`,
    '',
    `אם יש בעיה כלשהי, ניתן להשיב למספר זה את כמות המגיעים ואנו נחזור ${replyTo}.`,
    `בנוסף- מבקשים שתעדכנו אותנו כאן במידה ויש ${hasForYou} רגישות או אלרגיה 3>`,
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
    'ניפגש היום באיסט - תל אביב בשעה 19:30.',
    '',
    ...MESSAGE_SIGNATURE,
    '',
    'לנוחיותכם ניתן להעניק מתנה גם בכרטיס אשראי או דרך פייבוקס בקישור 👇',
  ].join('\n');

  return { textMessage, linkMessage: giftLink };
}

const MESSAGE_TEMPLATES = [
  {
    id: 'invitation',
    label: 'Initial invitation (sms_count = 0)',
    description:
      'First-time wedding invite with event details + RSVP link. Sent only to guests who have never been messaged. Guests marked invalid (arriving = -2) are skipped until their phone is corrected.',
    matchesGuest(guest, columns) {
      const neverMessaged = Number(guest[columns.smsCount] || 0) === 0;
      const invalidPhone = getArrivingCount(guest, columns.guestsAmountArriving) === -2;
      return neverMessaged && !invalidPhone;
    },
    markSent: true,
    buildMessage: buildInvitationMessage,
  },
  {
    id: 'rsvp-reminder',
    label: 'RSVP reminder (guests_amount_arriving = 0, sms_count > 0)',
    description:
      'Gentle nudge to complete RSVP. Sent to guests who have not confirmed yet and have already been messaged at least once. WhatsApp sends start Sunday morning and stay between 09:00 and 21:00.',
    matchesGuest(guest, columns) {
      const notConfirmed = getArrivingCount(guest, columns.guestsAmountArriving) === 0;
      const alreadyMessaged = Number(guest[columns.smsCount] || 0) > 0;
      return notConfirmed && alreadyMessaged;
    },
    markSent: false,
    incrementSmsCount: true,
    buildMessage: buildRsvpReminderMessage,
  },
  {
    id: 'countdown',
    label: 'Countdown message (arriving > 0, guest_details != finish)',
    description:
      'Sent between 09:00 and 21:00 to guests who confirmed they are coming, excluding guest_details = finish.',
    matchesGuest(guest, columns) {
      const arriving = getArrivingCount(guest, columns.guestsAmountArriving);
      const finished = String(guest[columns.guestDetails] || '').trim().toLowerCase() === 'finish';
      return arriving > 0 && !finished;
    },
    markSent: false,
    incrementSmsCount: true,
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
    incrementSmsCount: true,
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
