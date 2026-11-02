/*
 * Buying FAQs for the sales pages. Visible FAQs and FAQPage structured data are
 * generated from the same source so they never disagree.
 * Answers only use confirmed commercial terms from config/offer.js and
 * config/referral.js. Price answers adapt automatically when the Christmas
 * campaign ends (see config/campaign.js).
 */
const offer = require('../config/offer');
const campaign = require('../config/campaign');

function priceAnswer(c) {
  if (!c.showPrice) {
    return 'Our pricing for new FCA authorisation assistance is being updated. Book a 15-minute call and we’ll talk you through the current terms before you commit to anything. The FCA application fee is always separate.';
  }
  const parts = [
    `It’s £${offer.startPayment} to get started, then £${offer.monthlyPayment} per month by ${offer.paymentMethod}.`,
    `The first £${offer.startPayment} is your first monthly payment, not an extra setup fee.`,
    `There’s a ${offer.minimumTermWords}-month minimum term, so the minimum service commitment is £${offer.minimumTotal.amount}, before any applicable referral adjustments.`,
    offer.afterMinimumTerm,
    'The FCA application fee is separate.'
  ];
  if (offer.vatStatement) parts.push(offer.vatStatement);
  if (c.active) parts.push(`This is our Christmas offer for new customers, open until ${c.closingLabel}.`);
  return parts.join(' ');
}

const q = {
  price: (c) => ({
    question: 'How much does FCA authorisation assistance cost?',
    answer: priceAnswer(c),
    link: { href: '/pricing#payments', label: 'See how payments work' }
  }),
  totalCost: (c) => c.showPrice ? ({
    question: `Is £${offer.minimumTotal.amount} the total cost?`,
    answer: `No. £${offer.minimumTotal.amount} is the minimum service commitment across the ${offer.minimumTermWords}-month minimum term. Payments of £${offer.monthlyPayment} per month continue after that until you cancel under the agreed cancellation terms, so what you pay depends on how long you keep the service. The FCA application fee is also separate.`
  }) : null,
  previous: (c) => c.showPrice ? ({
    question: `How does this compare with your previous £${offer.previousPrice.amount.toLocaleString('en-GB')} price?`,
    answer: `Our previous application assistance was a one-off fee of £${offer.previousPrice.amount.toLocaleString('en-GB')}. The new service is a monthly subscription instead: £${offer.monthlyPayment} per month with a ${offer.minimumTermWords}-month minimum, continuing with reporting and compliance support after approval until you cancel. Because the payment structures differ, the total you pay depends on how long you keep the service.`
  }) : null,
  minimumTerm: (c) => !c.showPrice ? null : ({
    question: `Does the ${offer.minimumTermWords}-month term mean I’ll be approved within ${offer.minimumTermWords} months?`,
    answer: `No. The ${offer.minimumTermWords}-month minimum is our contract term, not an FCA timescale or a promised decision date. Only the FCA decides applications and how long they take, and we can’t guarantee approval. ${offer.decisionTimingTerms}`
  }),
  afterApproval: (c) => !c.showPrice ? null : ({
    question: 'What happens after I’m authorised?',
    answer: `${offer.decisionTimingTerms} Continuing reporting support is £${offer.reportingMonthly} per month before active referral discounts, which continue after authorisation. Payments continue until you cancel under the agreed cancellation terms.`
  }),
  fcaFee: () => ({
    question: 'Does the monthly payment include the FCA application fee?',
    answer: 'No. The FCA application fee is payable separately.'
  }),
  documents: () => ({
    question: 'What do you help me prepare?',
    answer: 'Following a discussion about your business, we help prepare a bespoke Regulatory Business Plan and the supporting documentation commonly required for a motor dealer application, including a compliance procedures manual, compliance monitoring programme, vulnerable customer policy, complaints procedure, customer journey document, initial disclosure document, regulatory status disclosure, financial crime procedures, suitability and fair treatment policy and organisational structure chart.'
  }),
  provide: () => ({
    question: 'What will I need to provide?',
    answer: 'Information about how your dealership operates: the business and the people running it, how you introduce customers to finance, the lenders or brokers you work with, and how you look after customers. We explain what’s needed and help you organise it. Your firm remains responsible for the accuracy of the information it supplies.'
  }),
  guarantee: () => ({
    question: 'Do you guarantee FCA approval?',
    answer: 'No. We provide FCA authorisation assistance. Only the FCA can decide whether authorisation is granted and how long it takes, and we can’t guarantee approval or timescales.'
  }),
  referral: () => ({
    question: 'How does the referral discount work?',
    answer: 'Each successful referral adds 25% off eligible monthly authorisation and continuing reporting subscription fees, up to 100% with four successful referrals. The discount continues after authorisation into reporting support on the same subscription. The initial £100 payment, FCA fees and separately purchased services are excluded. Each referred dealer must complete onboarding, have their first subscription payment received and remain subscribed and up to date with payments. If one cancels or stops qualifying, only their 25% discount ends from your next invoice: £75 becomes £100, or £50 becomes £75 if one of two referrals leaves. An enquiry or call alone does not qualify.',
    link: { href: '/referral', label: 'View referral savings and terms' }
  }),
  separate: () => ({
    question: 'Are CCR009 and wider compliance support included?',
    answer: 'CCR009 Return Assistance and our Ongoing Motor Dealer Compliance Support service are separate services with their own scope and pricing. After approval, your authorisation subscription continues with reporting and compliance support within the agreed scope. We’ll explain the difference in your call.',
    link: { href: '/services', label: 'Compare our services' }
  }),
  call: () => ({
    question: 'What happens in the 15-minute call?',
    answer: 'We’ll ask about your dealership and what you need, explain how our application support works, talk through the payments and commitment, and agree next steps if the service is suitable. It’s a conversation to help you decide. It isn’t regulatory advice and it doesn’t confirm eligibility. Your requested time is confirmed by us afterwards.',
    link: { href: '#book-meeting', label: 'Book your call' }
  }),
  portal: () => ({
    question: 'I’m an existing client. Where do I log in?',
    answer: 'Existing clients can continue to use the reporting portal through the Client login link at the top of every page.',
    link: { href: '/login', label: 'Go to client login' }
  })
};

const build = (keys) => {
  const c = campaign.state();
  return keys.map((k) => q[k](c)).filter(Boolean);
};

module.exports = {
  home: () => [
    { question: 'What does 009 Compliance help motor dealers with?', answer: 'We provide FCA authorisation assistance, CCR009 return assistance and ongoing motor dealer compliance support. We agree the scope and fees with you before work begins.' },
    { question: 'Can you help if my dealership is already authorised?', answer: 'Yes. Our CCR009 return assistance and ongoing compliance support are available to authorised dealerships. Speak to us about the records, reporting or administration you need help with.', link: { href: '/motor-dealer-compliance', label: 'Explore ongoing compliance support' } },
    { question: 'How much will the support cost?', answer: 'Fees depend on the service and agreed scope. We explain the charges and any ongoing commitment before you proceed. Current FCA authorisation assistance terms are available on the authorisation page.', link: { href: '/fca-authorisation-motor-dealers', label: 'View authorisation assistance' } },
    { question: 'What if I’m not sure which service I need?', answer: 'Book a 15-minute call and tell us about your dealership. We will talk through the support available and agree the next steps. Choose an available time and enter the phone number you want us to call. Your booking is confirmed on screen.', link: { href: '#book-meeting', label: 'Book a call' } },
    q.portal()
  ],
  authorisation: () => build(['price', 'totalCost', 'previous', 'fcaFee', 'minimumTerm', 'afterApproval', 'guarantee', 'documents', 'provide', 'separate', 'referral', 'call']),
  pricing: () => build(['price', 'totalCost', 'previous', 'minimumTerm', 'afterApproval', 'fcaFee', 'separate', 'referral']),
  referral: () => build(['referral', 'fcaFee', 'afterApproval', 'price']),
  toSchema: (faqs) => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer }
    }))
  })
};
