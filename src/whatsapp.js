const puppeteer = require('puppeteer');
const path = require('path');
const config = require('./config');

const WHATSAPP_URL = 'https://web.whatsapp.com';

// WhatsApp Web changes its DOM fairly often, so we try a small list of
// candidate selectors instead of relying on a single brittle one.
const MESSAGE_BOX_SELECTORS = [
  'div[contenteditable="true"][data-tab="10"]',
  'footer div[contenteditable="true"]',
  'div[aria-label="Type a message"]',
  'div[data-testid="conversation-compose-box-input"]',
];

const QR_CODE_SELECTOR = 'canvas[aria-label], div[data-ref] canvas';
const CHAT_LIST_SELECTOR = 'div[aria-label="Chat list"], #pane-side';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Launches Chromium with a persistent user data dir so WhatsApp Web stays
 * logged in between runs (no need to re-scan the QR code every time).
 */
async function launchBrowser() {
  const userDataDir = path.resolve(config.whatsapp.sessionDir);

  const browser = await puppeteer.launch({
    headless: config.whatsapp.headless,
    userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const [page] = await browser.pages();
  await page.goto(WHATSAPP_URL, { waitUntil: 'networkidle2' });

  return { browser, page };
}

/**
 * Waits until the user is logged in to WhatsApp Web, i.e. the chat list is
 * visible. If a QR code shows up first, it just waits for it to disappear
 * (which happens once the user scans it on their phone).
 */
async function waitForLogin(page, timeoutMs = 120000) {
  const qrVisible = await page
    .waitForSelector(QR_CODE_SELECTOR, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (qrVisible) {
    console.log('📱 QR code found. Please scan it with your phone to log in...');
  }

  await page.waitForSelector(CHAT_LIST_SELECTOR, { timeout: timeoutMs });
  console.log('✅ Logged in to WhatsApp Web.');
}

async function findMessageBox(page) {
  for (const selector of MESSAGE_BOX_SELECTORS) {
    const handle = await page.$(selector);
    if (handle) {
      return handle;
    }
  }
  return null;
}

/**
 * Types text into the message box one character at a time with a random
 * delay per keystroke, to look like a human typing instead of pasting.
 *
 * IMPORTANT: in WhatsApp Web's compose box, a plain Enter key SENDS the
 * message - only Shift+Enter inserts a line break. If we typed a literal
 * "\n" character with page.keyboard.type(), Puppeteer sends a plain Enter
 * keypress for it, which would prematurely send the message and split a
 * single multi-line message into several separate ones. So newlines are
 * typed as an explicit Shift+Enter instead.
 */
async function typeLikeHuman(page, elementHandle, text) {
  await elementHandle.click();
  for (const char of text) {
    if (char === '\n') {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    } else {
      await page.keyboard.type(char, {
        delay: randomDelay(config.delays.typeMinMs, config.delays.typeMaxMs),
      });
    }
  }
}

/**
 * Opens the chat for a given phone number and sends one or more messages to
 * it, typing each one in character-by-character and pressing Enter (a real
 * send, not a line break) after each. Passing several messages lets a
 * single contact receive them as separate WhatsApp bubbles - e.g. one for
 * the invitation text and a second one just for the RSVP link, so WhatsApp
 * renders a clean link preview for it.
 *
 * We intentionally navigate WITHOUT the `text` query param (only `phone`).
 * If we included `text`, WhatsApp Web would instantly pre-fill the compose
 * box for us, which is effectively "pasting" the message rather than the
 * human-like typing behaviour requested. Instead we open a blank chat and
 * type each message ourselves via `typeLikeHuman`.
 */
async function sendMessageToContact(page, phoneNumber, messages) {
  const messageList = Array.isArray(messages) ? messages : [messages];

  const url = `${WHATSAPP_URL}/send?phone=${encodeURIComponent(phoneNumber)}`;
  await page.goto(url, { waitUntil: 'networkidle2' });

  // WhatsApp shows a brief "loading chat" state before the compose box appears,
  // or an error toast if the number is invalid / not on WhatsApp.
  const invalidNumber = await page
    .waitForSelector('div[data-testid="popup-controls-ok"], div[role="alert"]', { timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (invalidNumber) {
    throw new Error(`Invalid or unreachable WhatsApp number: ${phoneNumber}`);
  }

  for (let i = 0; i < messageList.length; i += 1) {
    let messageBox = null;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !messageBox) {
      messageBox = await findMessageBox(page);
      if (!messageBox) {
        await sleep(500);
      }
    }

    if (!messageBox) {
      throw new Error(`Could not find message box for ${phoneNumber} (chat may not have loaded).`);
    }

    await typeLikeHuman(page, messageBox, messageList[i]);
    await page.keyboard.press('Enter');

    // Give WhatsApp a brief moment to register the send before typing the
    // next message (or navigating away, if this was the last one).
    const isLastPart = i === messageList.length - 1;
    await sleep(isLastPart ? 1500 : randomDelay(1000, 2500));
  }
}

module.exports = {
  launchBrowser,
  waitForLogin,
  sendMessageToContact,
  randomDelay,
  sleep,
};
