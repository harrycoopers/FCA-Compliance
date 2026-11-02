/* Each active qualifying referral discounts the ongoing core subscription by
 * 25 percentage points, including reporting after authorisation. This is the
 * public scheme configuration, not a connected billing or referral ledger.
 */
const STEP = 25;
const MAX_REFERRALS = 4;
const tiers = Array.from({ length: MAX_REFERRALS + 1 }, (_, n) => ({ referrals: n, percent: Math.min(n * STEP, 100) }));
const eligibilityTerms = '<p>A referral qualifies once the dealer completes onboarding, we identify the introducer, accept the dealer as a new customer and receive their first subscription payment. They must remain subscribed and up to date with payments. Each active qualifying referral reduces your subsequent core monthly subscription by 25%, capped at 100%, including continuing reporting support after FCA authorisation. The initial £100 payment remains payable. FCA fees, other third-party charges and separately purchased services or subscriptions are excluded.</p><p>If a referred customer cancels or stops qualifying, that referral’s 25% discount ends from your next invoice. The discounts for your other active qualifying referrals remain. On a £100 monthly subscription, one referral leaving changes £75 to £100; one of two leaving changes £50 to £75. Authorisation itself does not end the discount. See <a href="/terms">section 8 of the Terms of Business</a> for all eligibility restrictions and scheme-change terms.</p>';
const unresolved = [];
module.exports = { STEP, MAX_REFERRALS, tiers, eligibilityTerms, unresolved };
