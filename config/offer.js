/*
 * FCA Authorisation Assistance — commercial terms shown on the website.
 *
 * Single source for every price, term and qualification that appears on the
 * homepage, /fca-authorisation-motor-dealers, /pricing, /referral, the FAQs
 * and the structured data. Change a value here and every page follows.
 *
 * Anything left as null is UNCONFIRMED: templates hide it (or show a neutral
 * "being confirmed" note) and the server prints a reminder at start-up.
 */
const offer = {
  name: 'FCA Authorisation Assistance',
  audience: 'Car, motorcycle, van and commercial vehicle dealers applying for FCA authorisation',

  // ---- Confirmed by the business owner (October 2026) ----
  startPayment: 100,          // £100 to get started …
  startIsFirstMonth: true,    // … which IS the first monthly payment (not an extra setup fee)
  monthlyPayment: 100,        // £100 per month thereafter
  paymentMethod: 'Direct Debit',
  minimumTermMonths: 6,       // six-month minimum commitment
  fcaFeeSeparate: true,       // the FCA application fee is paid separately
  continuesUntilCancelled: true,
  reportingMonthly: 100,      // continuing reporting support base fee; active referral discounts apply

  // Genuine former price, shown only as clearly labelled historical context.
  previousPrice: {
    amount: 1000,
    label: 'Previous one-off application assistance fee'
  },

  minimumTotal: {
    amount: 600,
    explanation: 'Your £100 first payment is the first of the six monthly payments, so the minimum service commitment is £600, before any applicable referral adjustments.'
  },
  afterMinimumTerm: 'After six months, payments continue monthly until you cancel under the agreed cancellation terms.',
  decisionTimingTerms: 'If authorisation is approved before six months, the service continues with reporting and compliance support within the agreed scope.',

  // ---- UNCONFIRMED — leave null until confirmed ----
  // e.g. 'Prices include VAT.' / 'Prices exclude VAT, charged at the standard rate.' / 'VAT is not charged.'
  vatStatement: null,
  // Short label for the comparison table once confirmed, e.g. 'Inc. VAT' / '+ VAT' / 'No VAT'.
  vatShort: null,
  // Cancellation notice period — do NOT invent. e.g. 'Cancel with 30 days’ written notice.'
  cancellationNotice: null
};

const words = { 3: 'three', 6: 'six', 12: 'twelve' };
offer.minimumTermWords = words[offer.minimumTermMonths] || String(offer.minimumTermMonths);
offer.minimumTermTitle = offer.minimumTermWords.charAt(0).toUpperCase() + offer.minimumTermWords.slice(1);
offer.summary = `£${offer.startPayment} to get started, then £${offer.monthlyPayment} per month by ${offer.paymentMethod}, with a ${offer.minimumTermWords}-month minimum term.`;
// The qualification line that must sit directly beneath the offer.
offer.qualifier = `First month included. ${offer.minimumTermTitle}-month minimum term: £${offer.minimumTotal.amount} minimum service commitment. Payments continue monthly until cancellation. FCA application fee payable separately.`;

offer.unconfirmed = Object.entries({
  'VAT treatment of the £100 payments (config/offer.js → vatStatement, vatShort)': offer.vatStatement,
  'Cancellation notice period after the minimum term (config/offer.js → cancellationNotice)': offer.cancellationNotice
}).filter(([, value]) => value === null || value === undefined || value === '').map(([label]) => label);

module.exports = offer;
