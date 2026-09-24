/**
 * Standalone sender: wedding invites from Supabase over WhatsApp or 019 SMS.
 *
 * Run from the project root:
 *   node send-invites.js
 *
 * Supabase credentials come from a local .env when present, otherwise from
 * settings.js (the project's existing configuration). This file does not
 * change the guests table schema.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const config = require('./src/config');
const { getMessageTemplates } = require('./src/messageTemplates');
const { parsePhoneNumbers, normalizeIsraeliNumber } = require('./src/phoneUtils');

const settings = require('./settings');

function requireSmsSetting(value, label) {
  if (!value || String(value).startsWith('your-')) {
    throw new Error(`Please fill in "${label}" under sms019 in settings.js.`);
  }
  return value;
}

const SMS_019 = {
  username: requireSmsSetting(settings.sms019?.username, 'sms019.username'),
  token: requireSmsSetting(settings.sms019?.token, 'sms019.token'),
  source: requireSmsSetting(settings.sms019?.source, 'sms019.source'),
  liveUrl: 'https://019sms.co.il/api',
  testUrl: 'https://019sms.co.il/api/test',
  delayMs: 1000,
};

const { id: idCol, fullName: nameCol, phone: phoneCol, gender: genderCol } = config.supabase.columns;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function createSupabase() {
  loadDotEnv(path.resolve(__dirname, '.env'));

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || config.supabase.url;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    config.supabase.serviceKey;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function ask(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(String(answer).trim()));
  });
}

async function chooseTemplate(rl) {
  const templates = getMessageTemplates();

  console.log('\nChoose a message template:\n');
  templates.forEach((template, index) => {
    console.log(`  ${index + 1}. ${template.label}`);
    if (template.description) {
      console.log(`     ${template.description}`);
    }
  });

  const answer = await ask(rl, `\nEnter a number (1-${templates.length}): `);
  const template = templates[Number.parseInt(answer, 10) - 1];
  if (!template) {
    throw new Error('Invalid template choice.');
  }
  return template;
}

async function chooseChannel(rl) {
  console.log('\nChoose a sending channel:\n');
  console.log('  1. WhatsApp');
  console.log('  2. SMS (019)');

  const answer = await ask(rl, '\nEnter a number (1-2): ');
  if (answer === '1') {
    return 'whatsapp';
  }
  if (answer === '2') {
    return 'sms';
  }
  throw new Error('Invalid channel choice.');
}

async function chooseSmsTestMode(rl) {
  console.log('\nSMS mode:\n');
  console.log('  1. Test — one contact, both messages, via https://019sms.co.il/api/test (not delivered)');
  console.log('  2. Live — https://019sms.co.il/api');

  const answer = await ask(rl, '\nEnter a number (1-2): ');
  if (answer === '1') {
    return true;
  }
  if (answer === '2') {
    return false;
  }
  throw new Error('Invalid SMS mode choice.');
}

function validateTemplateConfig(template) {
  if (template.id === 'day-of' && !config.event.giftLink) {
    throw new Error('Day-of message requires event.giftLink in settings.js.');
  }
}

/**
 * 019 expects a local Israeli number: 05xxxxxxx or 5xxxxxxx.
 */
function toSmsPhone(rawNumber) {
  const international = normalizeIsraeliNumber(rawNumber);
  if (international.startsWith('972')) {
    return `0${international.slice(3)}`;
  }
  return international;
}

async function fetchGuests(supabase, template) {
  const { table, columns } = config.supabase;
  const select = [
    columns.id,
    columns.fullName,
    columns.phone,
    columns.gender,
    columns.smsCount,
    columns.guestsAmountArriving,
  ].join(', ');

  let query = supabase.from(table).select(select);
  if (template.id === 'invitation') {
    query = query.eq(columns.smsCount, 0);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch guests from Supabase: ${error.message}`);
  }

  return data || [];
}

async function markGuestSent(supabase, guestId, successCount) {
  const { table, columns } = config.supabase;
  const { error } = await supabase
    .from(table)
    .update({ [columns.smsCount]: successCount })
    .eq(columns.id, guestId);

  if (error) {
    throw new Error(`Failed to update sms_count for guest ${guestId}: ${error.message}`);
  }
}

function buildJobs(guests, template) {
  const jobs = [];

  for (const guest of guests) {
    if (!template.matchesGuest(guest, config.supabase.columns)) {
      continue;
    }

    const phones = parsePhoneNumbers(guest[phoneCol]);
    const name = guest[nameCol] || guest[idCol];

    if (phones.length === 0) {
      console.warn(`⚠️  Skipping ${name}: no phone number.`);
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
      console.error(`⚠️  Skipping ${name}: ${err.message}`);
      continue;
    }

    jobs.push({ guest, name, phones, messageParts });
  }

  return jobs;
}

async function postSms(endpoint, phone, message) {
  const body = {
    sms: {
      user: { username: SMS_019.username },
      source: SMS_019.source,
      destinations: { phone },
      message,
    },
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SMS_019.token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }

  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Non-JSON response (HTTP ${response.status}): ${raw.slice(0, 300)}`);
  }

  if (!response.ok || Number(data.status) !== 0) {
    const detail = data.message || data.error || raw.slice(0, 300) || `HTTP ${response.status}`;
    throw new Error(String(detail));
  }

  return data;
}

async function sendSmsJobs(jobs, template, supabase, testMode) {
  const endpoint = testMode ? SMS_019.testUrl : SMS_019.liveUrl;
  const jobsToSend = testMode
    ? [{ ...jobs[0], phones: [jobs[0].phones[0]] }]
    : jobs;
  const totalPhones = jobsToSend.reduce((sum, job) => sum + job.phones.length, 0);
  let sentCount = 0;
  let failedCount = 0;
  let phoneIndex = 0;

  if (testMode) {
    const contact = jobsToSend[0];
    const skipped = jobs.length - 1;
    console.log(`\n🧪 Test mode. One contact only: ${contact.name} (${contact.phones[0]}).`);
    console.log(`Both messages go to ${endpoint} and are not delivered.`);
    if (skipped > 0) {
      console.log(`${skipped} other matching guest(s) are skipped. sms_count is not updated.`);
    } else {
      console.log('sms_count is not updated.');
    }
  } else {
    console.log(`\n📤 Live SMS. Requests go to ${endpoint}.`);
  }

  for (const job of jobsToSend) {
    let guestSuccessCount = 0;

    for (const rawPhone of job.phones) {
      phoneIndex += 1;
      const phone = toSmsPhone(rawPhone);
      let phoneOk = true;

      for (let partIndex = 0; partIndex < job.messageParts.length; partIndex += 1) {
        const partLabel = partIndex === 0 ? 'text' : 'link';
        const message = job.messageParts[partIndex];

        try {
          console.log(`✉️  [${phoneIndex}/${totalPhones}] ${partLabel} → ${job.name} (${phone})...`);
          if (partLabel === 'link') {
            console.log(`   ${message}`);
          }

          const result = await postSms(endpoint, phone, message);
          const shipment = result.shipment_id ? ` shipment ${result.shipment_id}` : '';
          console.log(
            `✅ ${testMode ? 'Test accepted' : 'Sent'} ${partLabel} to ${phone}: ${result.message || 'ok'}${shipment}`
          );
        } catch (err) {
          phoneOk = false;
          console.error(`❌ Failed ${partLabel} to ${phone} (${job.name}): ${err.message}`);
        }

        const moreParts = partIndex < job.messageParts.length - 1;
        const morePhones = phoneIndex < totalPhones;
        if (moreParts || morePhones) {
          console.log(`⏳ Waiting ${SMS_019.delayMs}ms...`);
          await sleep(SMS_019.delayMs);
        }
      }

      if (phoneOk) {
        guestSuccessCount += 1;
        sentCount += 1;
      } else {
        failedCount += 1;
      }
    }

    if (!testMode && template.markSent) {
      await markGuestSent(supabase, job.guest[idCol], guestSuccessCount);
    }
  }

  return { sentCount, failedCount, totalPhones };
}

function pickNextBreakThreshold(randomDelay) {
  const { everyMin, everyMax } = config.delays.longBreak;
  return randomDelay(everyMin, everyMax);
}

async function sendWhatsAppJobs(jobs) {
  const { launchBrowser, waitForLogin, sendMessageToContact, randomDelay, sleep: wait } = require('./src/whatsapp');
  const template = jobs.template;
  const totalMessages = jobs.list.reduce((sum, job) => sum + job.phones.length, 0);

  const { browser, page } = await launchBrowser();
  let sentCount = 0;
  let failedCount = 0;
  let messageIndex = 0;
  let messagesSinceBreak = 0;
  let nextBreakThreshold = pickNextBreakThreshold(randomDelay);

  try {
    await waitForLogin(page);

    for (const job of jobs.list) {
      let guestSuccessCount = 0;

      for (const rawPhone of job.phones) {
        messageIndex += 1;
        const normalizedPhone = normalizeIsraeliNumber(rawPhone);

        try {
          console.log(`✉️  [${messageIndex}/${totalMessages}] Sending to ${job.name} (${rawPhone})...`);
          await sendMessageToContact(page, normalizedPhone, job.messageParts);
          guestSuccessCount += 1;
          sentCount += 1;
          console.log(`✅ Sent to ${rawPhone}.`);
        } catch (err) {
          failedCount += 1;
          console.error(`❌ Failed to send to ${rawPhone} (${job.name}): ${err.message}`);
        }

        const isLastMessage = messageIndex === totalMessages;
        if (!isLastMessage) {
          messagesSinceBreak += 1;

          if (messagesSinceBreak >= nextBreakThreshold) {
            const breakMs = randomDelay(config.delays.longBreak.minMs, config.delays.longBreak.maxMs);
            console.log(`☕ Taking a longer break: ${(breakMs / 1000).toFixed(1)}s...`);
            await wait(breakMs);
            messagesSinceBreak = 0;
            nextBreakThreshold = pickNextBreakThreshold(randomDelay);
          } else {
            const delayMs = randomDelay(config.delays.minMs, config.delays.maxMs);
            console.log(`⏳ Waiting ${(delayMs / 1000).toFixed(1)}s before the next message...`);
            await wait(delayMs);
          }
        }
      }

      if (template.markSent) {
        await markGuestSent(jobs.supabase, job.guest[idCol], guestSuccessCount);
      }
    }
  } finally {
    await browser.close();
  }

  return { sentCount, failedCount, totalPhones: totalMessages };
}

function printSummary({ sentCount, failedCount, totalPhones }, testMode) {
  console.log('\n--- Run summary ---');
  console.log(`${testMode ? 'Accepted (test)' : 'Sent'}: ${sentCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Total phones: ${totalPhones}`);
  if (testMode) {
    console.log('No live SMS was delivered. sms_count was not updated.');
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let template;
  let channel;
  let testMode = false;

  try {
    template = await chooseTemplate(rl);
    validateTemplateConfig(template);
    channel = await chooseChannel(rl);
    if (channel === 'sms') {
      testMode = await chooseSmsTestMode(rl);
    }
  } finally {
    rl.close();
  }

  const supabase = createSupabase();
  console.log(`\n🔎 Loading guests for: ${template.label}...`);
  const guests = await fetchGuests(supabase, template);
  const jobs = buildJobs(guests, template);

  if (jobs.length === 0) {
    console.log('No matching guests to message.');
    return;
  }

  const totalPhones = jobs.reduce((sum, job) => sum + job.phones.length, 0);
  console.log(`📋 Found ${jobs.length} guest(s), ${totalPhones} phone number(s).`);
  console.log('Each number gets two messages: the template text, then the personal link.');

  const summary =
    channel === 'sms'
      ? await sendSmsJobs(jobs, template, supabase, testMode)
      : await sendWhatsAppJobs({ list: jobs, template, supabase });

  printSummary(summary, channel === 'sms' && testMode);
}

main().catch((err) => {
  console.error('💥 Fatal error, aborting run:', err.message || err);
  process.exit(1);
});
