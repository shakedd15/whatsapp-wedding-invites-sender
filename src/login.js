// Standalone helper: run this once (`npm run login`) to open WhatsApp Web,
// scan the QR code, and persist the session to WHATSAPP_SESSION_DIR.
// After this succeeds, `npm start` will reuse the session without a QR scan.
const { launchBrowser, waitForLogin } = require('./whatsapp');

async function main() {
  const { browser, page } = await launchBrowser();
  await waitForLogin(page);
  console.log('Session saved. You can now run "npm start". Closing browser in 5s...');
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await browser.close();
}

main().catch((err) => {
  console.error('💥 Login failed:', err);
  process.exit(1);
});
