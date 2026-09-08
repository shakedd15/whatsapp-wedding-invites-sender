# WhatsApp Wedding Invites Sender

A Node.js automation script that sends wedding invitations over WhatsApp to guests stored in a `guests` table in Supabase, using Puppeteer and WhatsApp Web.

## What the script does

1. Connects to Supabase and fetches only guests from the `guests` table where `sms_count = 0` (i.e. no message has been sent to them yet).
2. For each guest, splits the `phone_number` column (which can hold several numbers separated by commas) into a list of numbers.
3. Builds the message content based on the guest's `gender` (`x`/`m`/`f`) and their `full_name`, split into two parts: the invitation text, and the RSVP link on its own (so WhatsApp renders a clean link preview for it).
4. Opens WhatsApp Web via Puppeteer, with a persistent session (`userDataDir`) so there's no need to scan the QR code every run.
5. For each phone number: opens the chat, "types" each message part character-by-character (not pasting) and sends it as its own WhatsApp bubble - so every contact receives exactly two messages: the text, then the link.
6. Waits a random amount of time between 15 and 30 seconds between messages, to reduce the risk of being blocked. On top of that, every 10-15 messages (the exact number is picked randomly) a longer "break" of 30-90 seconds happens, to look more like natural human behavior.
7. If sending to a specific number fails, it logs the error and moves on to the next number/guest (it doesn't stop the whole run).
8. After trying **all** of a guest's numbers (whether they succeeded or failed), it updates `sms_count` in Supabase to however many numbers actually succeeded.

**Important**: the only criterion for sending is `sms_count = 0`. As soon as at least one message has been sent successfully to a given guest, `sms_count` will be greater than 0 and that guest **will not be picked up again** on future runs - even if some of their phone numbers failed. (If *all* of a guest's numbers failed, `sms_count` stays at 0 and the next run will retry all of their numbers.)

## Setup

```bash
npm install
```

### Filling in the settings

All settings live in **`settings.js`** in the project root (a regular, visible file - not a hidden dotfile). Open it and fill in:

- `supabase.url` and `supabase.serviceKey` (from the Supabase Dashboard, Settings > API). **Important**: use the `secret` key (the new name for `service_role`), not the `publishable`/`anon` key, since the script both reads and writes (`UPDATE`).
- `event` - event details (day, date, venue, and RSVP base link) - these get injected automatically into the message content.

The `settings.js` file contains sensitive information (the secret key), so it's listed in `.gitignore` and won't accidentally end up anywhere shared. There's also a `settings.example.js` file - an empty template, in case `settings.js` gets deleted by mistake and you want to restore it.

### `guests` table structure (as it exists today)

```sql
create table public.guests (
  full_name character varying default ''::character varying,
  description character varying,
  phone_number character varying,   -- numbers separated by commas, e.g.: 0526139229,0525212364
  gender character varying,          -- x = plural, m = male, f = female
  guests_amount_we_expect bigint,
  guests_amount_arriving bigint,
  guests_max_amount bigint,
  guest_details character varying,
  guest_gift_amount double precision,
  id uuid not null default gen_random_uuid(),
  sms_count bigint not null default 0,      -- 0 = not sent yet, the only criterion for sending
  constraint guests_pkey primary key (id)
);
```

### Message template by gender

The actual invitation text is written in Hebrew (the guests are Hebrew speakers), built in `src/messageTemplates.js`:

| gender | greeting | second-person form |
|---|---|---|
| `x` (plural) | `{full_name} יקרים,` | `אתכם` |
| `m` (male) | `{full_name} היקר,` | `אותך` |
| `f` (female) | `{full_name} היקרה,` | `אותך` |

For example, for a guest with `full_name: שקד ואיל`, `gender: x`, `id: 118db49d-2e90-4023-8720-f7e0c376d397`, two separate WhatsApp messages will be sent:

Message 1:

```
שקד ואיל יקרים,
אנחנו מתרגשים במיוחד להזמין אתכם לחתונה שלנו!!!
האירוע ייערך ביום שלישי 10/11/26 באיסט - east

להזמנה ואישור הגעה לחצו -> 
```

Message 2:

```
https://eyal-shaked-wedding.com/?id=118db49d-2e90-4023-8720-f7e0c376d397
```

If `gender` has a value other than `x`/`m`/`f` (or is empty), that guest is skipped with a warning in the log, without stopping the whole run.

### Phone number format

Numbers can be entered in local Israeli format (`0526139229`) - the script automatically converts them to the international format WhatsApp requires (`972526139229`). Numbers already written in international format (`972...` or `+972...`) are left unchanged.

## Usage

### Step 1: one-time login and QR scan

```bash
npm run login
```

This opens a browser window with WhatsApp Web - scan the QR code with your phone. The session is saved to the folder set in `whatsapp.sessionDir` (default: `./whatsapp-session`), and from that point on there's no need to scan again.

### Step 2: running the send

```bash
npm start
```

The script fetches only guests with `sms_count = 0`, and sends to all of their phone numbers one after another, with random delays between messages.

## Safety notes and important remarks

- On the first run, it's recommended to keep `whatsapp.headless: false` in `settings.js` so you can see what's happening in the browser and confirm everything works.
- WhatsApp may block numbers that send a large volume of automated messages in a short time. Random delays and human-like typing reduce the risk, but don't eliminate it entirely - use responsibly and in line with WhatsApp's terms of service.
- If WhatsApp Web changes its DOM structure, you may need to update the selectors in `src/whatsapp.js`.
- It's recommended to test with one or two of your own phone numbers before running on the full guest list.

## Project structure

```
settings.js            # All your settings (Supabase, event details, WhatsApp, delays) - edit here
settings.example.js    # Empty template of settings.js
src/
  config.js            # Reads settings.js and validates that everything is filled in
  supabaseClient.js     # Fetches guests with sms_count = 0 + updates sms_count afterwards
  messageTemplates.js   # Builds the message content based on gender
  phoneUtils.js          # Splits phone_number into a list of numbers + normalizes to international format
  whatsapp.js            # Puppeteer logic: login, human-like typing, sending
  login.js               # Helper script for the one-time QR scan
  index.js               # Overall orchestration: fetch → build messages → send → update, with delays and error handling
```
