const { getArrivingCount } = require('./messageTemplates');

const TIME_ZONE = 'Asia/Jerusalem';
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sunday 25/10/2026 06:00 in Israel, including the daylight-saving change that day.
 */
function countdownStartDate() {
  const year = 2026;
  const month = 10;
  const day = 25;
  const hour = 6;
  const minute = 0;
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

function sortCountdownJobs(jobs, arrivingColumn) {
  return [...jobs].sort((left, right) => {
    const leftFirst = getArrivingCount(left.guest, arrivingColumn) === 0 ? 0 : 1;
    const rightFirst = getArrivingCount(right.guest, arrivingColumn) === 0 ? 0 : 1;
    return leftFirst - rightFirst;
  });
}

function logCountdownOrder(jobs, arrivingColumn) {
  const unconfirmed = jobs.filter((job) => getArrivingCount(job.guest, arrivingColumn) === 0).length;
  console.log(`Guests with guests_amount_arriving = 0 go first: ${unconfirmed}.`);
  console.log(`Then the rest: ${jobs.length - unconfirmed}.`);
}

async function waitUntilCountdownStart() {
  const start = countdownStartDate();
  const waitMs = start.getTime() - Date.now();
  if (waitMs <= 0) {
    console.log('Countdown start time has passed (Sunday 25/10/2026 06:00 Israel). Sending now.');
    return;
  }

  const hours = (waitMs / (60 * 60 * 1000)).toFixed(1);
  console.log(`Waiting until Sunday 25/10/2026 06:00 Israel time. About ${hours} hours.`);
  console.log('Leave this window open and keep the computer awake. Sending starts automatically.');
  await sleep(waitMs);
  console.log('Start time reached. Sending now.');
}

/**
 * Repeating batches for message 3.
 * Every 40 guests (40, 80, 120, 160...) pause 24 hours.
 * 10 guests before that (30, 70, 110, 150...) pause 5 hours.
 */
function countdownBatchPauseMs(guestsCompleted) {
  const inCycle = guestsCompleted % 40;
  if (inCycle === 0) {
    return ONE_DAY_MS;
  }
  if (inCycle === 30) {
    return FIVE_HOURS_MS;
  }
  return 0;
}

module.exports = {
  sortCountdownJobs,
  logCountdownOrder,
  waitUntilCountdownStart,
  countdownBatchPauseMs,
};
