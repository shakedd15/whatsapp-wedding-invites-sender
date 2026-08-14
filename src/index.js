const config = require('./config');
const { getGuestsForTemplate, markGuestSent } = require('./supabaseClient');
const { launchBrowser, waitForLogin, sendMessageToContact, randomDelay, sleep } = require('./whatsapp');
const { getMessageTemplates } = require('./messageTemplates');
const { promptMessageChoice } = require('./promptMessageChoice');
const { parsePhoneNumbers, normalizeIsraeliNumber } = require('./phoneUtils');

const { id: idCol, fullName: nameCol, phone: phoneCol, gender: genderCol } = config.supabase.columns;

function pickNextBreakThreshold() {
  const { everyMin, everyMax } = config.delays.longBreak;
  return randomDelay(everyMin, everyMax);
}

function validateTemplateConfig(template) {
  if (template.id === 'day-of' && !config.event.giftLink) {
    throw new Error('Day-of message requires event.giftLink in settings.js.');
  }
}

/**
 * Builds the list of "jobs" (one per matching guest), each carrying the
 * message to send and the list of phone numbers to try.
 */
function buildJobs(guests, template) {
  const jobs = [];

  for (const guest of guests) {
    if (!template.matchesGuest(guest, config.supabase.columns)) {
      continue;
    }

    const phones = parsePhoneNumbers(guest[phoneCol]);

    if (phones.length === 0) {
      console.warn(`⚠️  Skipping ${guest[nameCol] || guest[idCol]}: no phone number.`);
      continue;
    }

    let messageParts;
    try {
      const { textMessage, linkMessage } = template.buildMessage(
        { fullName: guest[nameCol], gender: guest[genderCol], id: guest[idCol] },
        config
      );
      messageParts = [textMessage, linkMessage];
    } catch (err) {
      console.error(`⚠️  Skipping ${guest[nameCol] || guest[idCol]}: ${err.message}`);
      continue;
    }

    jobs.push({ guest, phones, messageParts });
  }

  return jobs;
}

async function main() {
  const templates = getMessageTemplates();
  const template = await promptMessageChoice(templates);

  validateTemplateConfig(template);

  console.log(`\n🔎 Loading guests for: ${template.label}...`);
  const guests = await getGuestsForTemplate(template);
  const jobs = buildJobs(guests, template);

  if (jobs.length === 0) {
    console.log('No matching guests to message. 🎉');
    return;
  }

  const totalMessages = jobs.reduce((sum, job) => sum + job.phones.length, 0);
  console.log(`📋 Found ${jobs.length} guest(s) with ${totalMessages} message(s) to send.`);

  const { browser, page } = await launchBrowser();

  let sentCount = 0;
  let failedCount = 0;
  let messageIndex = 0;
  let messagesSinceBreak = 0;
  let nextBreakThreshold = pickNextBreakThreshold();

  try {
    await waitForLogin(page);

    for (const job of jobs) {
      const { guest, phones, messageParts } = job;
      const name = guest[nameCol];
      let guestSuccessCount = 0;

      for (const rawPhone of phones) {
        messageIndex += 1;
        const normalizedPhone = normalizeIsraeliNumber(rawPhone);

        try {
          console.log(`✉️  [${messageIndex}/${totalMessages}] Sending to ${name} (${rawPhone})...`);
          await sendMessageToContact(page, normalizedPhone, messageParts);

          guestSuccessCount += 1;
          sentCount += 1;
          console.log(`✅ Sent to ${rawPhone}.`);
        } catch (err) {
          failedCount += 1;
          console.error(`❌ Failed to send to ${rawPhone} (${name}): ${err.message}`);
        }

        const isLastMessage = messageIndex === totalMessages;
        if (!isLastMessage) {
          messagesSinceBreak += 1;

          if (messagesSinceBreak >= nextBreakThreshold) {
            const breakMs = randomDelay(config.delays.longBreak.minMs, config.delays.longBreak.maxMs);
            console.log(`☕ Taking a longer break: ${(breakMs / 1000).toFixed(1)}s...`);
            await sleep(breakMs);
            messagesSinceBreak = 0;
            nextBreakThreshold = pickNextBreakThreshold();
          } else {
            const delayMs = randomDelay(config.delays.minMs, config.delays.maxMs);
            console.log(`⏳ Waiting ${(delayMs / 1000).toFixed(1)}s before the next message...`);
            await sleep(delayMs);
          }
        }
      }

      if (template.markSent) {
        await markGuestSent(guest[idCol], guestSuccessCount);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\n--- Run summary ---');
  console.log(`Sent:   ${sentCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Total:  ${totalMessages}`);
}

main().catch((err) => {
  console.error('💥 Fatal error, aborting run:', err);
  process.exit(1);
});
