/*
 * Christmas campaign — one configurable deadline.
 *
 * The campaign runs until the END of 25 December 2026, Europe/London time.
 * In December the UK is on GMT (UTC+0), so the end of 25 December is
 * 2026-12-26T00:00:00Z. Change DEADLINE_ISO here and every page, the
 * countdown and the "closes" labels follow.
 *
 * After the deadline every festive element and campaign label is removed
 * automatically (server-side, on every request — no JavaScript needed).
 * This file never touches billing: existing customers are unaffected.
 */
const DEADLINE_ISO = '2026-12-26T00:00:00Z';   // end of Fri 25 Dec 2026, Europe/London
const CLOSING_LABEL = '25 December 2026';        // shown to visitors (also without JavaScript)
const CLOSING_DATE_ISO = '2026-12-25';          // machine-readable closing date for <time>

/*
 * What visitors see after the campaign ends. Same pricing confirmed 29 October 2026.
 *   mode: 'unconfirmed' → authorisation price blocks are replaced with a neutral
 *                          "speak to us about current pricing" panel. No price is invented.
 *   mode: 'continue'    → keep showing the £100/month offer from config/offer.js,
 *                          without any Christmas branding or closing date.
 *   mode: 'custom'      → show `headline` and `text` below in place of the price.
 */
const postCampaign = {
  mode: 'continue',
  headline: null,
  text: null
};

const deadline = new Date(DEADLINE_ISO);

function state(now = new Date()) {
  // Optional override for testing only, e.g. CAMPAIGN_NOW=2026-12-26T00:00:01Z
  const override = process.env.CAMPAIGN_NOW ? new Date(process.env.CAMPAIGN_NOW) : null;
  const at = override && !Number.isNaN(override.getTime()) ? override : now;
  const active = at.getTime() < deadline.getTime();
  const showPrice = active || postCampaign.mode === 'continue';
  return {
    active,
    expired: !active,
    deadlineIso: DEADLINE_ISO,
    closingLabel: CLOSING_LABEL,
    closingDateIso: CLOSING_DATE_ISO,
    daysLeft: active ? Math.ceil((deadline.getTime() - at.getTime()) / 86400000) : 0,
    showPrice,
    post: postCampaign
  };
}

module.exports = { DEADLINE_ISO, CLOSING_LABEL, postCampaign, state };
