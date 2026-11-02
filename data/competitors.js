/*
 * Advertised competitor prices for FCA authorisation support for motor dealers.
 * Rechecked live in a browser on 25 October 2026. Recheck before publishing and
 * whenever this table is shown for more than a few weeks.
 *
 * Only facts stated on each provider's own page are recorded. Service scope is
 * NOT assumed to be identical to ours. "fee" is the provider's professional fee.
 */
module.exports = {
  checked: '25 October 2026',
  providers: [
    {
      name: 'CreditLicence',
      url: 'https://creditlicence.com/car-dealers',
      fee: 995,
      headline: '£995 fixed fee',
      structure: 'One fixed fee, paid in two parts (£495 and £500)',
      vat: 'No VAT added (as stated)',
      fcaFee: 'Separate (itemised; collected with the final payment)'
    },
    {
      name: 'Carlive',
      url: 'https://carlive.co.uk/fca-support/',
      fee: 1299,
      headline: '£1,299, or £1,499 with interview preparation',
      structure: 'Package price; payment schedule not stated on the page',
      vat: 'Not stated — to be confirmed',
      fcaFee: 'Separate'
    },
    {
      name: 'Cardealer Consumer Credit',
      url: 'https://www.cardealer-consumer-credit.co.uk/',
      fee: 1500,
      headline: '£1,500 plus VAT',
      structure: 'Flat fee split into two equal payments: 50% up front, balance when the application is ready to submit',
      vat: 'Plus VAT',
      fcaFee: 'Separate'
    }
  ]
};
