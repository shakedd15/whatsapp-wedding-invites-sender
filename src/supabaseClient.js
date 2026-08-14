const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { persistSession: false },
});

const { table, columns } = config.supabase;

function getGuestSelectColumns() {
  return [
    columns.id,
    columns.fullName,
    columns.phone,
    columns.gender,
    columns.smsCount,
    columns.guestsAmountArriving,
  ].join(', ');
}

/**
 * Fetches guests for the selected message template.
 * The initial invitation only loads guests with sms_count = 0.
 * Follow-up templates load all guests and are filtered in buildJobs().
 */
async function getGuestsForTemplate(template) {
  const select = getGuestSelectColumns();
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

/**
 * Marks a guest as processed by setting sms_count to how many of its phone
 * numbers were actually sent successfully. This guest will not be picked up
 * again by the initial invitation once sms_count is greater than 0.
 */
async function markGuestSent(guestId, successCount) {
  const { error } = await supabase
    .from(table)
    .update({ [columns.smsCount]: successCount })
    .eq(columns.id, guestId);

  if (error) {
    throw new Error(`Failed to update sms_count for guest ${guestId}: ${error.message}`);
  }
}

module.exports = { supabase, getGuestsForTemplate, markGuestSent };
