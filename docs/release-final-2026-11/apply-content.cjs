'use strict';
// Applies the approved final pre-release content round to the guide and page registries and
// writes content-evidence.json (exact before/after values plus the primary sources checked).
// Run once from the repository root: node docs/release-final-2026-11/apply-content.cjs
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const file = name => path.join(root, name);
const read = name => JSON.parse(fs.readFileSync(file(name), 'utf8'));
const before = read('docs/release-final-2026-11/content-before.json');
const guides = JSON.parse(JSON.stringify(before));
const pages = read('config/seo-pages.json');
const links = read('config/guide-links.json');
const CHECKED = '2026-11-21';
const R = 'RELEASE_DATE';
const changes = [];

const S = {
  motor: { id: 'motor', label: 'FCA: permissions and applications for motor dealers', href: 'https://www.fca.org.uk/firms/authorisation/consumer-credit-brokers/motor-dealers' },
  broker: { id: 'broker', label: 'FCA: credit broker authorisation', href: 'https://www.fca.org.uk/firms/authorisation/consumer-credit-brokers' },
  apply: { id: 'apply', label: 'FCA: how to apply for authorisation', href: 'https://www.fca.org.uk/firms/authorisation/apply' },
  fees: { id: 'fees', label: 'FCA: authorisation application fees', href: 'https://www.fca.org.uk/firms/authorisation/apply/fees' },
  feesIndex: { id: 'feesIndex', label: 'FCA: fees and levies', href: 'https://www.fca.org.uk/firms/fees' },
  feeMovements: { id: 'feeMovements', label: 'FCA: 2026/27 fee movements and minimum fees', href: 'https://www.fca.org.uk/firms/fees-and-levies/fee-movements' },
  ccIncome: { id: 'ccIncome', label: 'FCA: consumer credit income for fees', href: 'https://www.fca.org.uk/firms/fees/consumer-credit-income-help' },
  rates: { id: 'rates', label: 'FCA: how annual fee rates are set and invoiced', href: 'https://www.fca.org.uk/firms/fees/how-we-decide-rates-annual-fees' },
  levies: { id: 'levies', label: 'FCA: levies collected for other organisations', href: 'https://www.fca.org.uk/firms/fees/organisations-we-collect-for' },
  ps143: { id: 'ps143', label: 'FCA: PS14/3 final rules for consumer credit firms', href: 'https://www.fca.org.uk/publications/policy-statements/ps14-3-final-rules-consumer-credit-firms' },
  oft: { id: 'oft', label: 'GOV.UK: Office of Fair Trading (closed 1 April 2014)', href: 'https://www.gov.uk/government/organisations/office-of-fair-trading' },
  supporting: { id: 'supporting', label: 'FCA: supporting material for credit and consumer finance applications', href: 'https://www.fca.org.uk/firms/authorisation/supporting-material-credit-mortgage-consumer-finance' },
  connect: { id: 'connect', label: 'FCA: registering for Connect', href: 'https://www.fca.org.uk/firms/connect/registration' },
  smcr: { id: 'smcr', label: 'FCA: Senior Managers and Certification Regime', href: 'https://www.fca.org.uk/firms/senior-managers-certification-regime' },
  s55V: { id: 's55V', label: 'legislation.gov.uk: FSMA 2000 s.55V — determination of applications', href: 'https://www.legislation.gov.uk/ukpga/2000/8/section/55V' },
  refusal: { id: 'refusal', label: 'FCA: our refusal process', href: 'https://www.fca.org.uk/firms/authorisation/apply/refusal-process' },
  practice: { id: 'practice', label: 'FCA: authorisation applications — good practice and areas for improvement', href: 'https://www.fca.org.uk/publications/good-poor-practice/authorisation-registration-applications' },
  cond23: { id: 'cond23', label: 'FCA Handbook: COND 2.3 — effective supervision', href: 'https://handbook.fca.org.uk/handbook/cond2/cond2s4' },
  cond24: { id: 'cond24', label: 'FCA Handbook: COND 2.4 — appropriate resources', href: 'https://handbook.fca.org.uk/handbook/cond2/cond2s5' },
  s55X: { id: 's55X', label: 'legislation.gov.uk: FSMA 2000 s.55X — warning and decision notices', href: 'https://www.legislation.gov.uk/ukpga/2000/8/section/55X' },
  s387: { id: 's387', label: 'legislation.gov.uk: FSMA 2000 s.387 — warning notices', href: 'https://www.legislation.gov.uk/ukpga/2000/8/section/387' },
  s388: { id: 's388', label: 'legislation.gov.uk: FSMA 2000 s.388 — decision notices', href: 'https://www.legislation.gov.uk/ukpga/2000/8/section/388' },
  s55Z3: { id: 's55Z3', label: 'legislation.gov.uk: FSMA 2000 s.55Z3 — right to refer to the Tribunal', href: 'https://www.legislation.gov.uk/ukpga/2000/8/section/55Z3' },
  ccr007: { id: 'ccr007', label: 'FCA: completing CCR007', href: 'https://www.fca.org.uk/firms/ccr007-consumer-credit-data' },
  reporting: { id: 'reporting', label: 'FCA: consumer credit reporting', href: 'https://www.fca.org.uk/firms/regulatory-reporting/consumer-credit-reporting' },
  ccr: { id: 'ccr', label: 'FCA: CCR009 reporting, scope and submission', href: 'https://www.fca.org.uk/firms/consumer-credit-reporting/ccr009' },
  sup: { id: 'sup', label: 'FCA Handbook: SUP 16.12 — reporting schedules', href: 'https://handbook.fca.org.uk/handbook/sup16/sup16s41' },
  cca189: { id: 'cca189', label: 'legislation.gov.uk: Consumer Credit Act 1974 s.189 — definitions', href: 'https://www.legislation.gov.uk/ukpga/1974/39/section/189' },
  rao36A: { id: 'rao36A', label: 'legislation.gov.uk: Regulated Activities Order art. 36A — credit broking', href: 'https://www.legislation.gov.uk/uksi/2001/544/article/36A' },
  rao60B: { id: 'rao60B', label: 'legislation.gov.uk: Regulated Activities Order art. 60B — regulated credit agreements', href: 'https://www.legislation.gov.uk/uksi/2001/544/article/60B' },
  rao60C: { id: 'rao60C', label: 'legislation.gov.uk: Regulated Activities Order art. 60C — exempt credit agreements', href: 'https://www.legislation.gov.uk/uksi/2001/544/article/60C' },
  rao60L: { id: 'rao60L', label: 'legislation.gov.uk: Regulated Activities Order art. 60L — relevant recipient of credit', href: 'https://www.legislation.gov.uk/uksi/2001/544/article/60L' },
  rao60O: { id: 'rao60O', label: 'legislation.gov.uk: Regulated Activities Order art. 60O — exempt consumer hire', href: 'https://www.legislation.gov.uk/uksi/2001/544/article/60O' },
  perg27: { id: 'perg27', label: 'FCA Handbook: PERG 2.7 — exempt agreements and business purposes', href: 'https://handbook.fca.org.uk/handbook/perg2/perg2s7' },
  conc35: { id: 'conc35', label: 'FCA Handbook: CONC 3.5 — representative example', href: 'https://handbook.fca.org.uk/handbook/conc3/conc3s5' },
  conc37: { id: 'conc37', label: 'FCA Handbook: CONC 3.7 — credit broker promotions and status', href: 'https://handbook.fca.org.uk/handbook/conc3/conc3s7' },
  conc45: { id: 'conc45', label: 'FCA Handbook: CONC 4.5 — commissions', href: 'https://handbook.fca.org.uk/handbook/conc4/conc4s5' },
  carFinance: { id: 'carFinance', label: 'FCA: car finance complaints and PCP/HP agreements', href: 'https://www.fca.org.uk/consumers/car-finance-complaints' },
  brokingRules: { id: 'brokingRules', label: 'FCA: credit broking firms — key rules', href: 'https://www.fca.org.uk/firms/credit-broking-rules' }
};
const P = {
  doNeed: '/do-motor-dealers-need-fca-authorisation', licence: '/fca-licence-car-dealers', limited: '/limited-permission-fca-authorisation-motor-dealers',
  broking: '/credit-broking-permission-motor-dealers', documents: '/fca-application-documents-motor-dealers', delayed: '/why-fca-applications-get-delayed',
  cost: '/fca-authorisation-cost-car-dealers', apply: '/how-to-apply-fca-limited-permission-car-dealers', refused: '/fca-application-refused-motor-dealers',
  offerFinance: '/how-to-offer-car-finance-dealers', ccr007: '/what-is-ccr007', vans: '/van-commercial-vehicle-dealers-fca-permissions',
  info: '/what-information-is-needed-for-ccr009', checklist: '/ccr009-reporting-checklist-motor-dealers', prepare: '/how-to-prepare-for-ccr009-return',
  vs: '/ccr009-vs-ccr007', overview: '/fca-compliance-motor-dealers-guide', website: '/website-compliance-motor-dealers', duty: '/consumer-duty-motor-dealers',
  whatCcr009: '/what-is-ccr009', due: '/when-is-ccr009-due'
};

function record(guide, section, after, sources, reason) {
  const get = (obj, keys) => keys.reduce((o, k) => o == null ? undefined : o[k], obj);
  const keys = section.split('.');
  const old = get(before[guide], keys);
  changes.push({ guide, section, before: old === undefined ? null : old, after, sources: sources.map(s => ({ url: s.href, label: s.label })), checked: CHECKED, reason });
  let target = guides[guide];
  for (const key of keys.slice(0, -1)) target = target[key];
  target[keys.at(-1)] = after;
}
const sectionIndex = (guide, id) => guides[guide].sections.findIndex(s => s.id === id);
function addSource(guide, source) {
  if (guides[guide].sources.some(s => s.href === source.href)) return;
  guides[guide].sources = [...guides[guide].sources, source];
  const existing = changes.find(c => c.guide === guide && c.section === 'sources');
  if (existing) { existing.after = guides[guide].sources; existing.sources.push({ url: source.href, label: source.label }); }
  else changes.push({ guide, section: 'sources', before: before[guide].sources, after: guides[guide].sources, sources: [{ url: source.href, label: source.label }], checked: CHECKED, reason: 'Sources added for revised wording' });
}
function revise(guide) { guides[guide].modified = R; }
function page(route, fields) { Object.assign(pages[route], fields); }

/* ---------- 1. Click-through fixes on ranking pages ---------- */
{
  const g = P.doNeed;
  record(g, 'title', 'Do Car Dealers Need FCA Authorisation to Offer Finance?', [S.motor], 'Searcher wording: car dealers, offer finance');
  record(g, 'seoTitle', 'Do Car Dealers Need FCA Authorisation to Offer Finance?', [S.motor], 'Brand suffix dropped (approved) so the full question shows');
  record(g, 'description', 'Yes, if you introduce buyers to car finance. Most car dealers need FCA limited permission for credit broking, or an appointed representative arrangement.', [S.motor], 'Direct yes/no and permission type');
  record(g, 'answer', 'Yes, in most cases. A UK car dealer that introduces customers to car finance needs FCA authorisation, usually limited permission for secondary credit broking, or must act as an appointed representative of an authorised firm. Selling cars for cash alone does not need it. Part-exchanges with outstanding finance, or providing your own finance, can need extra permissions, and using another finance broker does not remove your own responsibilities.', [S.motor, S.broker], 'Answer yes/no plus permission type in the first sentence');
  record(g, 'siblings', [{ need: 'to start offering PCP or HP finance', href: P.offerFinance }, { need: 'the application steps', href: P.apply }], [], 'Distinguish from sibling guides');
  revise(g);
}
{
  const g = P.broking;
  record(g, 'title', 'Credit Broking Permission for Car and Motor Dealers', [S.rao36A], 'Searcher wording: car dealers');
  record(g, 'seoTitle', 'Credit Broking Permission for Car Dealers | 009 Compliance', [S.rao36A], 'Searcher wording: FCA credit broking permission');
  record(g, 'description', 'What credit broking is, which FCA credit broking permission car dealers usually need, and how a credit broking application works. Clear, sourced steps.', [S.rao36A, S.motor], 'Queries: fca credit broking permission, what is credit broking, credit brokering application');
  record(g, 'answer', 'Credit broking means introducing a customer who wants credit or hire to a lender, hire provider or another broker, or presenting or offering a credit agreement on a lender’s behalf. For a car dealer this needs FCA credit broking permission: usually limited permission where finance is secondary to selling vehicles you own, or full permission in other cases. Receiving no commission does not, by itself, mean an introduction falls outside credit broking.', [S.rao36A, S.motor], 'Define credit broking in one plain sentence first');
  record(g, 'faqs', [...before[g].faqs, { question: 'How do we make a credit broking application?', answer: 'Apply to the FCA through its Connect system: choose limited or full permission, complete the application form and the forms for the people involved, attach the business plan, forecasts and supporting material, pay the application fee and submit.' }], [S.apply, S.connect, S.supporting], 'Query: credit brokering application');
  record(g, 'siblings', [{ need: 'to check whether you need authorisation at all', href: P.doNeed }, { need: 'the application steps', href: P.apply }], [], 'Distinguish from sibling guides');
  addSource(g, S.rao36A); addSource(g, S.apply);
  revise(g);
}
{
  const g = P.licence;
  record(g, 'title', 'FCA Licence for Car Dealers: The Consumer Credit Licence Today', [S.ps143], 'Mention consumer credit licence');
  record(g, 'seoTitle', 'FCA Licence for Car Dealers (Consumer Credit Licence)', [S.ps143], 'Brand suffix dropped (approved)');
  record(g, 'description', 'Still called a consumer credit licence? Car dealers now need FCA authorisation. See which permission covers finance, what it costs and how to apply.', [S.ps143, S.motor], 'Queries: fca licence price, consumer credit licence application, apply for fca licence');
  record(g, 'answer', '“FCA licence” and “consumer credit licence” are common names for what is now FCA authorisation: the FCA took over consumer credit regulation from the Office of Fair Trading on 1 April 2014. A car dealer that offers finance needs authorisation with the right permission, usually limited permission for credit broking. A Firm Reference Number (FRN) identifies a firm; the number alone does not show that it can carry out every type of finance activity.', [S.ps143, S.oft, S.motor], 'Explain the licence terminology first');
  const i = sectionIndex(g, 'guide-section-4');
  record(g, `sections.${i}.links`, [[P.cost, 'Check what FCA authorisation costs'], [P.apply, 'Follow the steps to apply for an FCA licence'], ...before[g].sections[i].links], [S.fees, S.apply], 'Links to cost and how-to-apply guides');
  record(g, 'faqs', [...before[g].faqs,
    { question: 'How do I apply for an FCA licence?', answer: 'Apply for FCA authorisation through the FCA’s Connect system. Choose limited or full permission, complete the forms, attach your business plan and supporting material, pay the FCA application fee and submit.' },
    { question: 'Does the FCA charge for a consumer credit licence?', answer: 'The FCA charges an application fee when you submit and annual fees and levies once you are authorised. The cost guide sets out the current FCA figures and links to the FCA’s fee pages.' }], [S.apply, S.connect, S.fees], 'Queries: apply for fca licence, fca licence price');
  record(g, 'siblings', [{ need: 'the FCA fees', href: P.cost }, { need: 'the application steps', href: P.apply }], [], 'Distinguish from sibling guides');
  addSource(g, S.ps143); addSource(g, S.oft); addSource(g, S.apply);
  revise(g);
}
// CCR009 siblings: each page answers one question.
record(P.info, 'siblings', [{ need: 'a final check before you submit', href: P.checklist }, { need: 'a plan for the whole CCR009 process', href: P.prepare }], [], 'This page answers: which records answer each CCR009 question');
record(P.checklist, 'siblings', [{ need: 'to work out which records answer each question', href: P.info }, { need: 'a plan for the whole CCR009 process', href: P.prepare }], [], 'This page answers: is the draft return ready to submit');
record(P.prepare, 'siblings', [{ need: 'the records behind each question', href: P.info }, { need: 'a final check before you submit', href: P.checklist }], [], 'This page answers: how to plan and run the CCR009 process');
record(P.overview, 'siblings', [{ need: 'ongoing compliance support for your dealership', href: '/motor-dealer-compliance', title: 'Ongoing compliance support for motor dealers' }, { need: 'to compare our services', href: '/services', title: 'Motor dealer compliance services' }], [], 'This page answers: which free guide answers your question');
record(P.vs, 'siblings', [{ need: 'an explanation of CCR007 on its own', href: P.ccr007 }], [], 'Link to new CCR007 guide');
record(P.delayed, 'siblings', [{ need: 'to know what happens if the FCA refuses an application', href: P.refused }], [], 'Link to new refusal guide');
record(P.documents, 'siblings', [{ need: 'the application process step by step', href: P.apply }], [], 'Documents page vs process page, cross-linked both ways');
[P.info, P.checklist, P.prepare, P.overview, P.vs, P.delayed].forEach(revise);

// Documents FAQ: no 009 Compliance price in FAQs or FAQ schema; terms unchanged.
{
  const g = P.documents;
  const faqs = before[g].faqs.map(f => /£\s*\d/.test(f.question + f.answer)
    ? { question: 'Is the FCA application fee included in 009 Compliance’s fees?', answer: 'No. The FCA application fee is paid separately to the FCA when the application is submitted in Connect. It is not part of 009 Compliance’s assistance fees.' } : f);
  record(g, 'faqs', faqs, [S.fees], 'Remove price from FAQ and FAQPage schema; offer terms unchanged');
  revise(g);
}

// Offer links use rotated descriptive anchors (config/guide-offer-links.json); remove generic in-paragraph offer links.
{
  const anchors = read('config/guide-offer-links.json').anchors;
  const g = P.overview, i = sectionIndex(g, 'guide-section-5');
  const anchor = anchors[Object.keys(before).indexOf(g) % anchors.length];
  const updated = before[g].sections[i].links.map(l => l[0] === '/fca-authorisation-motor-dealers' ? [l[0], anchor.charAt(0).toUpperCase() + anchor.slice(1)] : l);
  record(g, `sections.${i}.links`, updated, [], 'Rotated descriptive anchor for the FCA offer page');
}
for (const route of Object.keys(links)) links[route] = links[route].filter(l => l.href !== '/fca-authorisation-motor-dealers');

// Audit P1 internal links (audits/2026-11-21-seo-geo/INTERNAL-LINKS.csv): route CCR009 readers to the CCR007 guide.
{
  const i = sectionIndex(P.whatCcr009, 'guide-section-2');
  record(P.whatCcr009, `sections.${i}.links`, [...before[P.whatCcr009].sections[i].links, [P.ccr007, 'CCR007 key data return']], [S.ccr], 'Audit P1 internal link to the CCR007 guide');
  const j = sectionIndex(P.due, 'guide-section-5');
  record(P.due, `sections.${j}.links`, [...before[P.due].sections[j].links, [P.ccr007, 'what CCR007 asks for']], [S.ccr007], 'Audit P1 internal link to the CCR007 guide');
  revise(P.whatCcr009); revise(P.due);
}

// Trim pre-existing descriptions to ≤155 characters (wording otherwise unchanged).
record(P.info, 'description', 'Map CCR009 questions to dealership source records: field definitions, reporting periods and financial measures, with a fictional reconciliation example.', [], 'Trim meta description to ≤155 characters');
record(P.checklist, 'description', 'Check CCR009 readiness before submission: access, period, evidence, reconciliation, open questions and confirmation that the return was submitted.', [], 'Trim meta description to ≤155 characters');
record(P.due, 'description', 'Check CCR009 reporting periods, the 40-business-day submission window, first-period rules and the £5 million boundary before confirming your deadline.', [], 'Trim meta description to ≤155 characters');

/* ---------- 4. New guides ---------- */
const base = { group: 'fca', finance: true, reviewed: CHECKED, modified: R, published: R };
const sec = (id, title, o = {}) => ({ title, paragraphs: o.p || [], bullets: o.b || [], columns: o.c || [], rows: o.r || [], sources: o.s || [], links: o.l || [], id, ...(o.fee ? { feeNote: true } : {}) });
const uniq = list => [...new Map(list.map(s => [s.href, s])).values()];
const newGuides = {};

newGuides[P.cost] = { ...base, navigationGroup: 'preparation',
  title: 'How Much Does FCA Authorisation Cost for a Car Dealer?',
  seoTitle: 'FCA Authorisation Cost for Car Dealers | 009 Compliance',
  description: 'What a consumer credit licence costs now: the FCA application fee, annual FCA fees and levies, and other costs car dealers should plan for before applying.',
  answer: 'For a car dealer applying for limited permission, the FCA application fee is £560 (Category 2), paid in Connect when you submit. It is not refunded if the application is withdrawn or refused. Once authorised, you pay an annual FCA fee, with a minimum fee for limited-permission firms, plus levies the FCA collects for other bodies. There is no separate consumer credit licence fee: the licence is now FCA authorisation.',
  feeNote: { checked: CHECKED, href: S.fees.href, label: 'FCA: authorisation application fees' },
  sections: [
    sec('guide-section-1', 'What a consumer credit licence costs now', { p: [
      'The FCA took over consumer credit regulation from the Office of Fair Trading on 1 April 2014. A search for a “consumer credit licence cost” or an “FCA licence price” is now a question about the cost of FCA authorisation.',
      'The FCA’s charges come in two parts: a one-off application fee, then annual fees and levies once the firm is authorised. The cost of preparing the application, including any outside help, is separate from FCA fees.'], s: [S.ps143, S.oft] }),
    sec('guide-section-2', 'The FCA application fee', { fee: true, c: ['Point', 'What the FCA says'], r: [
      ['Limited permission (fee-block CC1)', 'Category 2 application fee: £560.'],
      ['Range across all applications', 'From £280 (Category 1) up to £225,170 (Category 10).'],
      ['When it is paid', 'In Connect, by credit or debit card. You have to pay the fee to submit the application.'],
      ['Refunds', 'The FCA’s fees page says the fee is non-refundable. If the FCA rejects a submission without assessing it because minimum information is missing, you can resubmit it with the missing information. Check the FCA’s current fees page on refunds.']],
      p: ['The fee pays for the FCA’s assessment, not for an approval.'], s: [S.fees, S.feesIndex, S.apply] }),
    sec('guide-section-3', 'Annual FCA fees and levies', { fee: true, c: ['Cost', 'What applies to a limited-permission firm'], r: [
      ['Annual FCA fee', 'Fee-block CC01 (credit-related regulated activities with limited permission), based on consumer credit annual income, subject to a minimum fee.'],
      ['Minimum fee for 2026/27', '£1,100, the same for every consumer credit related income band (up to £10,000, £10,000 to £100,000 and over £100,000). In earlier fee years the bands had different minimums.'],
      ['Consumer credit income', 'For credit broking, commission and related income. Where there is no commission income, the FCA’s proxy is 5% of the value of the credit agreement.'],
      ['Invoices', 'Issued from July each year and usually due 30 days from the invoice date.'],
      ['Levies collected by the FCA', 'All firms pay the Financial Guidance levy, limited-permission (CC1) firms pay a flat illegal money lending levy, and the Financial Ombudsman Service levy may apply. The amounts are set each year.']],
      p: ['The FCA says 2026/27 is the final year of its phased increases to consumer credit minimum fees, with future increases linked to inflation.'], s: [S.feeMovements, S.ccIncome, S.rates, S.levies] }),
    sec('guide-section-4', 'Other costs to plan for', { p: [
      'Allow time to prepare the regulatory business plan, financial forecasts, policies and the individual forms the FCA expects. Individual controllers need a criminal background check carried out no earlier than 6 months before the application.',
      'Outside help with an application is optional and is not an FCA fee. If you are comparing support, use the current scope and terms on our pricing page rather than an estimate in this guide.'],
      l: [['/pricing', 'See 009 Compliance pricing and scope'], [P.apply, 'Follow the application steps']], s: [S.supporting, S.apply] }),
    sec('guide-section-5', 'Fictional example: budgeting for the FCA fees', { fee: true, p: [
      'Fictional example. Example Motors Ltd owns its stock and plans to introduce buyers to third-party car finance. It applies for limited permission and pays the £560 Category 2 application fee in Connect when it submits.',
      'Before authorisation it budgets for its first annual FCA invoice and levies, checking how the FCA calculates fees for its first fee year rather than assuming a figure. This example is illustrative; fees change each fee year, so check the FCA’s pages before you apply.'], s: [S.fees, S.rates] })
  ],
  faqs: [
    { question: 'How much is the FCA application fee for limited permission?', answer: 'The FCA places limited consumer credit permission (fee-block CC1) in Category 2, with an application fee of £560, paid in Connect when you submit.', feeNote: true },
    { question: 'Is the FCA application fee refundable?', answer: 'The FCA’s fees page says the application fee is non-refundable. If the FCA rejects a submission because minimum information is missing, you can resubmit it with the missing information. Check the FCA’s current fees page on refunds.' },
    { question: 'Do I still need a consumer credit licence?', answer: 'No. The FCA took over consumer credit regulation from the Office of Fair Trading on 1 April 2014. Car dealers now need FCA authorisation with the right permissions.' },
    { question: 'Are there annual FCA fees after authorisation?', answer: 'Yes. Authorised firms pay an annual FCA fee and levies. For 2026/27 the minimum annual fee for a limited-permission firm is £1,100.', feeNote: true }
  ],
  related: [P.apply, P.documents, P.licence],
  siblings: [{ need: 'the application steps', href: P.apply }]
};

newGuides[P.apply] = { ...base, navigationGroup: 'preparation',
  title: 'How to Apply for FCA Limited Permission as a Car Dealer',
  seoTitle: 'How to Apply for FCA Limited Permission as a Car Dealer',
  description: 'Step by step: how car dealers apply for FCA limited permission, from Connect set-up and application sections to paying the fee and answering FCA questions.',
  answer: 'To apply for FCA limited permission, confirm the activities and the legal entity, register for the FCA’s Connect system, choose limited permission, complete the application form and the forms for the people involved, attach your business plan, forecasts and supporting material, pay the application fee and submit. Do not start regulated activity until the FCA has authorised the firm.',
  sections: [
    sec('guide-section-1', 'Step 1: confirm the permission and the applicant', { p: [
      'The FCA’s motor-dealer guidance says a dealer that owns the vehicles it sells meets its definition of a supplier and can apply for limited permission. Introducing customers to finance for purposes other than buying or leasing the vehicles you sell needs full permission.',
      'Decide which legal entity will hold the permission before you start the forms. The application, website and customer process should all describe the same business.'],
      l: [[P.doNeed, 'Check whether you need authorisation'], [P.limited, 'Compare limited and full permission']], s: [S.motor] }),
    sec('guide-section-2', 'Step 2: register for Connect and start the application', { p: [
      'Applications are made on the FCA’s Connect system. An unauthorised firm registers for Standard Connect, which covers new authorisation applications, and selects limited or full permission when it starts the application.',
      'The FCA asks applicants to read its credit broker guidance in full before submitting through Connect.'], s: [S.connect, S.broker] }),
    sec('guide-section-3', 'Step 3: complete the forms', { b: [
      'Consumer credit authorisation form.',
      'Form A and the core details.',
      'An individual form for each person who will hold a senior management function.',
      'IT self-assessment questionnaire.',
      'Corporate and trust controller forms, where relevant.',
      'Appendices for significant events, sole traders and owners and influencers, where relevant.'],
      p: ['The FCA lists these forms for motor dealers on its supporting-material page. Individual controllers also need a criminal background check carried out no earlier than 6 months before the application.'], s: [S.supporting, S.apply, S.smcr] }),
    sec('guide-section-4', 'Step 4: attach supporting material, pay and submit', { p: [
      'The application must include the application form, business plan, financial forecasts and the other forms and supporting material for your type of firm. The FCA expects final versions and says it will not review draft documents.',
      'Pay the application fee in Connect by credit or debit card; you have to pay it to submit.'],
      l: [[P.documents, 'See what the application documents should contain'], [P.cost, 'Check the FCA application fee']], s: [S.apply, S.fees] }),
    sec('guide-section-5', 'Step 5: after you submit', { p: [
      'A case officer is assigned and you can track progress in Connect. The FCA usually has questions, so respond by the dates it gives. Substantive changes after submission may lead the FCA to ask you to withdraw and reapply.',
      'By law the FCA must decide a complete application within 6 months and an incomplete one within 12 months. Your firm must not carry on regulated activities while the application is under review unless an exemption or temporary permission applies.'],
      l: [[P.delayed, 'Understand delays and clarification requests'], [P.refused, 'See what happens if the FCA proposes to refuse']], s: [S.apply, S.s55V] }),
    sec('guide-section-6', 'Fictional example: one dealer’s application', { p: [
      'Fictional example. Example Cars Ltd owns its stock and plans to introduce buyers to third-party car finance. Its director registers the company for Connect, starts a limited-permission application, completes the consumer credit authorisation form and the individual form for the person taking the senior management function, and uploads the final business plan and forecasts.',
      'The company pays the fee, submits and answers the case officer’s questions by the dates given. It does not introduce customers to finance until the FCA confirms authorisation.'] })
  ],
  faqs: [
    { question: 'Where do I apply for FCA limited permission?', answer: 'On the FCA’s Connect system. Register for Standard Connect, then choose limited permission when you start the application.' },
    { question: 'Can I submit draft documents and finish them later?', answer: 'No. The FCA expects final versions and says it will not review draft documents.' },
    { question: 'How long does the FCA take to decide?', answer: 'The law requires a decision within 6 months of a complete application and within 12 months for an incomplete one. FCA questions are usual, so allow time to respond.' },
    { question: 'Can we start offering finance once we have applied?', answer: 'No. Do not carry on regulated activities while the application is under review unless an exemption or temporary permission applies.' }
  ],
  related: [P.documents, P.cost, P.delayed],
  siblings: [{ need: 'the documents rather than the process', href: P.documents }, { need: 'the FCA fees', href: P.cost }]
};

newGuides[P.refused] = { ...base, navigationGroup: 'preparation',
  title: 'FCA Application Refused or Rejected: What Motor Dealers Can Do',
  seoTitle: 'FCA Application Refused? Options for Motor Dealers',
  description: 'Why the FCA refuses or rejects applications, how this differs from withdrawal, what a warning notice means and what to change before you reapply.',
  answer: 'An FCA refusal follows a set process: the FCA gives feedback and you can withdraw; if you continue, you receive a warning notice and can make written representations before any decision notice, which you can refer to the Upper Tribunal. A submission rejected for missing minimum information is different: you can resubmit it with the missing information. Check the FCA’s current fees page on refunds.',
  sections: [
    sec('guide-section-1', 'Rejected, withdrawn or refused: the difference', { c: ['Outcome', 'What it means', 'Next step'], r: [
      ['Rejected', 'The FCA rejects a submission without assessing it if minimum information is missing and explains why.', 'Resubmit with the missing information. Check the FCA’s current fees page on refunds.'],
      ['Withdrawn', 'The applicant can withdraw at any time before the application is determined. The fee is not refunded.', 'Another application can be made later.'],
      ['Refused', 'The FCA recommends refusal where it thinks the application does not meet the standard for authorisation. The fee is not refunded.', 'The warning notice and decision notice process applies.']],
      s: [S.apply, S.refusal, S.fees, S.s55V] }),
    sec('guide-section-2', 'Why applications fall short', { p: [
      'The FCA assesses applicants against the threshold conditions, which include effective supervision and appropriate resources. Its review of applications gives examples of weaknesses, such as relying on a compliance consultant without being able to show the firm understands its own obligations, and not submitting historic financial accounts with the initial application.',
      'The FCA also says a business model should not be generic, and that it might refuse an application if information is deliberately withheld, false or incomplete.'],
      l: [[P.delayed, 'See why FCA applications get delayed']], s: [S.cond23, S.cond24, S.practice, S.apply] }),
    sec('guide-section-3', 'Warning notice, representations and decision notice', { b: [
      'Before a warning notice, the FCA gives feedback. If you withdraw at this stage, the assessment ends.',
      'A warning notice sets out the proposed refusal and the reasons, and allows at least 14 days for representations. The FCA can extend the period.',
      'Representations are normally made in writing to the FCA’s decision maker, who can still decide not to refuse.',
      'A decision notice states any right to refer the matter to the Upper Tribunal and the procedure. Once it is given, the application has been determined and cannot be withdrawn.',
      'If the decision notice is not referred, the FCA issues a final notice. The FCA may publish decision and final notices.'],
      p: ['The deadline for referring a decision notice to the Upper Tribunal is confirmed in the notice itself.'], s: [S.refusal, S.s55X, S.s387, S.s388, S.s55Z3] }),
    sec('guide-section-4', 'Before you apply again', { p: [
      'The FCA confirms that another application can be made after a withdrawal. Before reapplying, deal with every point raised in feedback or notices, check that the business plan describes how your dealership actually works, and make sure the people named can explain the application without relying on an adviser.',
      'After a formal refusal, read the decision notice carefully and consider any Tribunal reference before deciding how to proceed.'],
      l: [[P.documents, 'Rebuild the application documents'], [P.apply, 'Follow the application steps']], s: [S.apply, S.practice] }),
    sec('guide-section-5', 'Fictional example: withdrawing and reapplying', { p: [
      'Fictional example. Example Autos Ltd submits a limited-permission application with a business plan copied from a template. The case officer’s questions show the plan does not explain how the dealership handles part-exchanges with outstanding finance, and the FCA gives feedback that the application does not meet its standards.',
      'The company withdraws, rewrites the plan around its actual customer journey, adds the permission it needs for part-exchanges and reapplies. This example is illustrative and does not predict any FCA decision.'], s: [S.motor, S.refusal] })
  ],
  faqs: [
    { question: 'Is the application fee refunded if the FCA refuses my application?', answer: 'No. The FCA says the application fee is non-refundable, including after a refusal or a withdrawal. A submission rejected for missing minimum information can be resubmitted with that information; check the FCA’s current fees page on refunds.' },
    { question: 'Can I withdraw instead of being refused?', answer: 'Yes, at any time before the application is determined, including after informal feedback. Once a decision notice is given, the application has been determined and cannot be withdrawn.' },
    { question: 'How long do I have to respond to a warning notice?', answer: 'The warning notice sets the period, which must be at least 14 days. The FCA can extend it.' },
    { question: 'Can I challenge a refusal?', answer: 'Yes. An applicant can refer the decision to the Upper Tribunal. The decision notice confirms the right, the procedure and the deadline.' }
  ],
  related: [P.delayed, P.documents, P.apply],
  siblings: [{ need: 'to understand delays rather than refusals', href: P.delayed }]
};

newGuides[P.offerFinance] = { ...base, navigationGroup: 'permissions',
  title: 'How to Offer PCP and HP Car Finance to Your Customers',
  seoTitle: 'How to Offer Car Finance (PCP and HP) as a Dealer',
  description: 'How dealers start offering PCP and HP finance: FCA authorisation, joining lender panels, and the FCA rules on promotions, commission and customers.',
  answer: 'To offer PCP and HP finance, a dealer first needs FCA permission for credit broking or an appointed representative arrangement, then arrangements with the lenders or brokers it will introduce customers to. Once live, FCA rules apply: promotions must say you are a credit broker, not a lender, commission must be disclosed where it could affect your impartiality or the customer’s decision, and the Consumer Duty applies.',
  sections: [
    sec('guide-section-1', 'What you are offering: PCP and HP', { p: [
      'Under a hire-purchase agreement the customer hires the vehicle and ownership passes once the terms are met. The FCA’s car finance guidance treats personal contract purchase (PCP) as a type of hire-purchase agreement. When a dealer introduces a customer to a lender for either, it is carrying on credit broking.',
      'Check each product’s actual terms; the lender is the party that provides the credit.'], s: [S.cca189, S.carFinance, S.rao36A] }),
    sec('guide-section-2', 'Step 1: get the right permission', { p: [
      'A dealer that owns its stock and introduces customers to third-party finance is likely to need limited permission for secondary credit broking. Part-exchanges with outstanding finance also need debt adjusting and debt counselling permissions. The alternative is an appointed representative arrangement with an authorised principal.'],
      l: [[P.doNeed, 'Check whether you need authorisation'], [P.apply, 'Apply for limited permission']], s: [S.motor] }),
    sec('guide-section-3', 'Step 2: set up lender and broker arrangements', { p: [
      'The FCA expects your regulatory business plan to identify the lenders or brokers you intend to work with and to state any fees you charge and what commission you will earn. Agree with each one how introductions, documents and complaints will be handled, and record the commission terms you will need to disclose.',
      'Ask each lender or broker what it requires before it accepts introductions from your dealership.'], s: [S.motor] }),
    sec('guide-section-4', 'Step 3: the rules once you offer finance', { c: ['Rule', 'What it means for a dealer'], r: [
      ['Broker, not lender (CONC 3.7.7R)', 'Financial promotions must state prominently that you are a credit broker and not a lender.'],
      ['Legal name (CONC 3.7.5R)', 'Promotions and customer communications must show your legal name as it appears on the Financial Services Register, not only a trading name.'],
      ['Extent of powers (CONC 3.7.3R)', 'Say whether you work exclusively with one or more lenders or independently.'],
      ['Representative example (CONC 3.5)', 'Where CONC 3.5 requires one, a finance promotion must include a representative example with the specified information.'],
      ['Commission disclosure (CONC 4.5.3R)', 'Disclose the existence and nature of commission prominently and in good time where it could affect your impartiality or the customer’s decision, and how it may affect what the customer pays.'],
      ['No discretionary commission (CONC 4.5.6R)', 'Since 28 January 2021, lenders and brokers must not use discretionary commission arrangements in motor finance.'],
      ['Consumer Duty', 'The FCA says the Consumer Duty requires your firm to put its customers’ needs first.']],
      l: [[P.website, 'Check your website finance wording'], [P.duty, 'Read the Consumer Duty guide']], s: [S.conc37, S.conc35, S.conc45, S.brokingRules, S.broker] }),
    sec('guide-section-5', 'Fictional example: a first finance customer', { p: [
      'Fictional example. Example Motor Sales Ltd has limited permission and an arrangement with a lender. A customer asks about PCP on a used car. The salesperson explains that the dealership is a credit broker, not a lender, discloses the commission arrangement and how it can affect the cost, and gives the lender’s representative example.',
      'The dealer passes the application to the lender, which makes the lending decision, and keeps a record of what the customer was told.'] })
  ],
  faqs: [
    { question: 'Do I need FCA authorisation to offer PCP finance?', answer: 'Yes, in most cases. Introducing customers to PCP or HP finance is credit broking, which needs FCA permission or an appointed representative arrangement.' },
    { question: 'What are the FCA rules for offering car finance as a dealer?', answer: 'The main rules are in CONC: promotions must say you are a broker, not a lender, and show your legal name; commission must be disclosed where it could affect your impartiality or the customer’s decision; and discretionary commission arrangements are banned. The Consumer Duty also applies.' },
    { question: 'Do I have to tell customers how much commission I earn?', answer: 'You must disclose the existence and nature of commission where CONC 4.5.3R applies, and the amount, or likely amount, if the customer asks.' },
    { question: 'Can I set the customer’s interest rate to earn more commission?', answer: 'No. Discretionary commission arrangements, which let a broker adjust the rate and earn more commission, have been banned in motor finance since 28 January 2021.' }
  ],
  related: [P.doNeed, P.broking, P.website],
  siblings: [{ need: 'to check whether you need authorisation at all', href: P.doNeed }]
};

newGuides[P.ccr007] = { ...base, group: 'ccr', navigationGroup: 'reporting',
  title: 'What Is CCR007?',
  seoTitle: 'What Is CCR007? FCA Key Data Return | 009 Compliance',
  description: 'CCR007 is the FCA Key Data return for limited-permission credit firms: who submits it, how often, what it asks and how it links to CCR009.',
  answer: 'CCR007 is the FCA’s Key Data return for credit firms with limited permission, and all firms with limited permission must submit it. It asks for revenue, transaction and complaint figures for credit-related regulated activities, reported on a calendar-year basis from 2026. Dealers that also submit CCR009 can enter zero in some CCR007 fields.',
  feeNote: { checked: CHECKED, href: S.ccr007.href, label: 'FCA: completing CCR007', prefix: 'FCA guidance checked', inOpening: false },
  sections: [
    sec('guide-section-1', 'What CCR007 is and who submits it', { p: [
      'CCR007 is the data item “Key Data for Credit Firms with Limited Permissions”. The FCA says all firms with limited permission must submit it, so a car dealer with limited permission for secondary credit broking should expect it on its reporting schedule.',
      'Consumer credit returns are submitted through RegData, the FCA’s online data collection platform. Check your firm’s schedule there for the returns and due dates that apply.'], s: [S.reporting, S.ccr007] }),
    sec('guide-section-2', 'What it asks for', { b: [
      'Revenue from credit-related regulated activities.',
      'Total revenue, including from other activities.',
      'Number of transactions involving credit-related regulated activities in the period.',
      'Number of complaints about credit-related regulated activities received in the period.',
      'The credit-related regulated activity that generated the most turnover.',
      'Total annual income as defined for FCA fees (FEES 4 Annex 11BR).'],
      p: ['The last item is the income figure the FCA uses to calculate annual fees.'], s: [S.ccr007, S.ccIncome] }),
    sec('guide-section-3', 'When it is due', { fee: true, p: [
      'From 2026, the FCA requires CCR007 and CCR009 to be reported on a calendar-year basis, 1 January to 31 December, rather than by reference to the firm’s accounting reference date. The FCA’s reporting table gives 30 business days to submit CCR007, compared with 40 for CCR009.',
      'The FCA says firms that do not complete their reporting by the due date are subject to an administrative fee of £100.'],
      l: [[P.due, 'Check CCR009 periods and deadlines']], s: [S.reporting, S.sup, S.ccr007] }),
    sec('guide-section-4', 'How CCR009 changed CCR007', { p: [
      'CCR009 came into effect on 7 May 2025. Firms submitting CCR009 may report zero in CCR007 fields 1A and 3A where those fields relate only to credit broking or not-for-profit debt management. Accurate figures are still needed for other limited-permission activities and in all the remaining fields.'],
      l: [[P.vs, 'Compare CCR009 and CCR007'], [P.whatCcr009, 'Read what CCR009 covers']], s: [S.ccr] }),
    sec('guide-section-5', 'Fictional example: one dealer, two returns', { p: [
      'Fictional example. Example Motors Ltd has limited permission for secondary credit broking. Its schedule shows CCR007 and CCR009 for the 2026 calendar year. It gathers its commission income, the number of transactions and the complaints received for the year.',
      'Because fields 1A and 3A relate only to its credit broking, it enters zero there, completes the remaining CCR007 fields accurately and answers the CCR009 questions separately.'], s: [S.ccr] })
  ],
  faqs: [
    { question: 'Who has to submit CCR007?', answer: 'The FCA says all firms with limited permission must submit CCR007. Check your firm’s reporting schedule in RegData.' },
    { question: 'Is CCR007 the same as CCR009?', answer: 'No. CCR007 is the Key Data return for limited-permission firms; CCR009 covers relevant ancillary credit firms. A limited-permission dealer can need to submit both.' },
    { question: 'What period does CCR007 cover?', answer: 'From 2026, the calendar year from 1 January to 31 December, not the firm’s accounting reference date.' }
  ],
  related: [P.vs, P.whatCcr009, P.due],
  siblings: [{ need: 'a side-by-side comparison with CCR009', href: P.vs }]
};

newGuides[P.vans] = { ...base, navigationGroup: 'permissions',
  title: 'Do Van and Commercial Vehicle Dealers Need FCA Permission?',
  seoTitle: 'FCA Permissions for Van and Commercial Vehicle Dealers',
  description: 'Selling vans to sole traders or small partnerships? Some business vehicle finance is still regulated consumer credit. See which customers are covered.',
  answer: 'Often, yes. Finance for a sole trader, a partnership of two or three partners (not all of them companies) or another unincorporated body can still be regulated consumer credit, so introducing those customers to finance needs FCA credit broking permission. Finance for a limited company is outside these rules, and some business agreements over £25,000 are exempt, although introducing them can still be credit broking.',
  sections: [
    sec('guide-section-1', 'Which business customers are covered', { c: ['Customer', 'Can consumer credit rules apply?'], r: [
      ['Private individual', 'Yes.'],
      ['Sole trader', 'Yes. A sole trader borrows as an individual.'],
      ['Partnership of two or three partners, not all of them companies', 'Yes. The Consumer Credit Act includes these partnerships in “individual”.'],
      ['Unincorporated body, such as a club or association, not made up entirely of companies', 'Yes. It is also included in “individual”.'],
      ['Partnership of four or more partners, or one made up entirely of companies', 'No. It falls outside the definition.'],
      ['Limited company', 'No. A company is neither an individual nor a relevant recipient of credit.']],
      s: [S.cca189, S.rao60L, S.rao60B] }),
    sec('guide-section-2', 'The business-purpose exemptions', { p: [
      'Credit over £25,000 is exempt where the agreement is entered into wholly or predominantly for the borrower’s business. Below that level, the business exemption applies only to green deal plans, so most van finance of £25,000 or less to a sole trader or small partnership remains regulated.',
      'A business-purpose declaration by the borrower that complies with CONC App 1.4 creates a presumption, but it does not apply if the lender, or anyone acting for it, knows or has reasonable cause to suspect the agreement is not for business purposes. Hire agreements have a similar exemption where the hirer must pay more than £25,000 wholly or predominantly for business purposes.'],
      s: [S.rao60C, S.perg27, S.rao60O] }),
    sec('guide-section-3', 'Exempt agreements can still involve credit broking', { p: [
      'Credit broking includes introducing an individual or relevant recipient of credit to a lender for an agreement that would be regulated but for the business exemption. A dealer introducing a sole trader to exempt business finance over £25,000 is still carrying on credit broking.',
      'Some CONC rules also apply to those introductions, including the commission disclosure rules in CONC 4.5.3R and 4.5.4R.'],
      l: [[P.broking, 'Read the credit broking permission guide']], s: [S.rao36A, S.conc45] }),
    sec('guide-section-4', 'Plan around your customer mix', { p: [
      'Plan permissions around the regulated introductions you will make, not the vehicle type. A dealership selling vans to private buyers, sole traders and companies needs a process that identifies which rules apply to each customer.'],
      b: ['Record the customer’s legal form before discussing finance.', 'For a partnership, count the partners and check whether any are companies.', 'Do not rely on a business-purpose declaration if you know or suspect the vehicle is mainly for personal use.'],
      l: [[P.doNeed, 'Check whether you need authorisation'], [P.limited, 'Compare limited and full permission']], s: [S.perg27, S.motor] }),
    sec('guide-section-5', 'Fictional example: three van customers', { p: [
      'Fictional example. Example Commercials Ltd sells used vans. A sole trader finances an £18,000 van for the business: the agreement is regulated, because below £25,000 the business exemption applies only to green deal plans.',
      'A three-partner electrical firm finances £32,000 of vans wholly for the business and signs a compliant declaration: the agreement may be exempt, but the dealer’s introduction is still credit broking. A limited company’s finance is outside the consumer credit rules.'], s: [S.rao60C, S.rao36A, S.cca189] })
  ],
  faqs: [
    { question: 'Do van dealers need FCA authorisation if they only sell to businesses?', answer: 'It depends on the businesses. Sole traders, partnerships of two or three partners (not all of them companies) and some unincorporated bodies are covered by consumer credit rules; limited companies are not.' },
    { question: 'Is van finance for business use always exempt?', answer: 'No. The business exemption covers credit over £25,000 used wholly or predominantly for business. Below £25,000, the business exemption applies only to green deal plans.' },
    { question: 'If the finance agreement is exempt, do we still need credit broking permission?', answer: 'Possibly. Introducing an individual or relevant recipient of credit to an agreement that would be regulated but for the business exemption is still credit broking.' }
  ],
  related: [P.doNeed, P.broking, P.limited],
  siblings: [{ need: 'the general car dealer position', href: P.doNeed }]
};

for (const [route, guide] of Object.entries(newGuides)) {
  guide.sources = uniq(guide.sections.flatMap(s => s.sources).concat(guide.feeNote ? [S[guide.feeNote.href === S.fees.href ? 'fees' : 'ccr007']] : []));
  guides[route] = guide;
  pages[route] = { title: guide.seoTitle, description: guide.description };
  changes.push({ guide: route, section: 'new-guide', before: null, after: guide, sources: guide.sources.map(s => ({ url: s.href, label: s.label })), checked: CHECKED, reason: 'New guide (approved list item)' });
}
// Registry titles/descriptions stay aligned with guide metadata.
for (const [route, guide] of Object.entries(guides)) { pages[route].title = guide.seoTitle; pages[route].description = guide.description; }

/* ---------- Service pages (registry metadata) ---------- */
page('/referral', { description: 'Refer a motor dealer: 25% off eligible monthly subscription fees per qualifying referral, up to 100%. Initial payment and FCA fees excluded. Terms apply.', lastmod: R });
page('/motor-dealer-compliance', { title: 'Car Dealer Compliance Support | 009 Compliance', description: 'Dealership compliance support after FCA approval: documents, reporting preparation, Consumer Duty, website checks and periodic reviews. Scope agreed first.', lastmod: R });
page('/about', { title: 'About 009 Compliance | Our Team: 30+ Years in the Motor Trade', description: '009 Compliance helps motor dealers with FCA authorisation, CCR009 returns and ongoing compliance. Our team brings 30+ years in the motor trade.', lastmod: R });
for (const route of ['/', '/services', '/fca-authorisation-motor-dealers', '/guides', '/pricing', '/ccr009-return-assistance-motor-dealers']) page(route, { lastmod: R });
// One experience statement across the site (audit N-3).
page('/motor-finance-for-dealerships', { description: 'Explore motor-finance broker support for your dealership. Our team brings 30+ years in the motor trade. Start with a conversation about your next steps.', lastmod: R });

/* ---------- Order: keep new guides next to their topic in the registry ---------- */
const order = Object.keys(guides);
fs.writeFileSync(file('config/guide-content.json'), JSON.stringify(Object.fromEntries(order.map(k => [k, guides[k]])), null, 2) + '\n');
fs.writeFileSync(file('config/seo-pages.json'), JSON.stringify(pages, null, 2) + '\n');
fs.writeFileSync(file('config/guide-links.json'), JSON.stringify(Object.fromEntries(order.map(k => [k, links[k] || []])), null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'content-evidence.json'), JSON.stringify({ checked: CHECKED, releaseDateToken: R, changes }, null, 2) + '\n');
console.log('changes', changes.length, 'guides', Object.keys(guides).length);
