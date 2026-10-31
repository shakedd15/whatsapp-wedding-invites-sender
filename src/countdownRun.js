const TIME_ZONE = 'Asia/Jerusalem';
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEND_START_MINUTES = 9 * 60;
const SEND_END_MINUTES = 21 * 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function zonedTimeToDate(year, month, day, hour, minute) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(utcGuess))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return new Date(utcGuess - (zonedAsUtc - utcGuess));
}

/**
 * Sunday 25/10/2026 06:00 in Israel, including the daylight-saving change that day.
 */
function countdownStartDate() {
  return zonedTimeToDate(2026, 10, 25, 6, 0);
}

function israelParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function minutesOfDay(date) {
  const parts = israelParts(date);
  return parts.hour * 60 + parts.minute;
}

function isWithinSendWindow(date = new Date()) {
  const minutes = minutesOfDay(date);
  return minutes >= SEND_START_MINUTES && minutes <= SEND_END_MINUTES;
}

function addCalendarDay(parts) {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + ONE_DAY_MS);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function nextWindowOpen(from = new Date()) {
  const parts = israelParts(from);
  if (minutesOfDay(from) < SEND_START_MINUTES) {
    return zonedTimeToDate(parts.year, parts.month, parts.day, 9, 0);
  }
  const tomorrow = addCalendarDay(parts);
  return zonedTimeToDate(tomorrow.year, tomorrow.month, tomorrow.day, 9, 0);
}

/**
 * The day-long pause should resume on the next calendar day, inside 09:00-21:00.
 * If 24 hours lands outside that window, wait a little less or a little more.
 */
function dayPauseMs(now = new Date()) {
  const ideal = new Date(now.getTime() + ONE_DAY_MS);
  const tomorrow = addCalendarDay(israelParts(now));
  const windowStart = zonedTimeToDate(tomorrow.year, tomorrow.month, tomorrow.day, 9, 0);
  const windowEnd = zonedTimeToDate(tomorrow.year, tomorrow.month, tomorrow.day, 21, 0);
  let resume = ideal;
  if (ideal < windowStart) {
    resume = windowStart;
  } else if (ideal > windowEnd) {
    resume = windowEnd;
  }
  return Math.max(0, resume.getTime() - now.getTime());
}

async function waitUntilSendWindow() {
  if (isWithinSendWindow()) {
    return;
  }

  const open = nextWindowOpen();
  const waitMs = open.getTime() - Date.now();
  const parts = israelParts(open);
  const clock = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  console.log(`Outside 09:00-21:00 Israel time. Next send at ${parts.day}/${parts.month} ${clock}.`);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

async function waitUntilDate(start, label) {
  const waitMs = start.getTime() - Date.now();
  if (waitMs <= 0) {
    console.log(`${label} has passed. Sending now.`);
    return;
  }

  const hours = (waitMs / (60 * 60 * 1000)).toFixed(1);
  console.log(`Waiting until ${label}. About ${hours} hours.`);
  console.log('Leave this window open and keep the computer awake. Sending starts automatically.');
  await sleep(waitMs);
  console.log('Start time reached. Sending now.');
}

async function waitUntilCountdownStart() {
  await waitUntilDate(countdownStartDate(), 'Sunday 25/10/2026 06:00 Israel');
}

async function waitUntilReminderStart() {
  await waitUntilDate(zonedTimeToDate(2026, 11, 1, 9, 0), 'Sunday 01/11/2026 09:00 Israel');
}

/**
 * Repeating batches for message 3.
 * Every 40 guests (40, 80, 120, 160...) pause until the next day, inside 09:00-21:00.
 * 10 guests before that (30, 70, 110, 150...) pause 5 hours.
 */
function countdownBatchPauseMs(guestsCompleted) {
  const inCycle = guestsCompleted % 40;
  if (inCycle === 0) {
    return dayPauseMs();
  }
  if (inCycle === 30) {
    return FIVE_HOURS_MS;
  }
  return 0;
}

module.exports = {
  waitUntilCountdownStart,
  waitUntilReminderStart,
  waitUntilSendWindow,
  countdownBatchPauseMs,
};
