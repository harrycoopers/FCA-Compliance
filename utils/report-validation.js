'use strict';
const fields = ['total_vehicles_sold','funded_deals','lenders_brokers_used','finance_commission','total_turnover','finance_complaints','finance_complaints_cases','finance_complaints_details','fees_paid_brokers','px_settlements_number','px_settlements_value','changes_since_last_month','changes_details'];
const counts = new Set(['total_vehicles_sold','funded_deals','finance_complaints_cases','px_settlements_number']);
const amounts = new Set(['finance_commission','total_turnover','fees_paid_brokers','px_settlements_value']);
function validate(body, existingMonth, now = new Date()) {
  const fail = message => ({ error: message });
  if (body.confirm_submission !== 'yes') return fail('Please confirm the declaration before saving.');
  const month = body.reporting_month ?? (typeof body.report_year === 'string' && typeof body.report_month === 'string' ? `${body.report_year}-${body.report_month}` : undefined);
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('Choose a valid reporting month.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit'}).formatToParts(now).map(x => [x.type,x.value]));
  const current = `${parts.year}-${parts.month}`;
  const first = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 36, 1)).toISOString().slice(0,7);
  if (month !== existingMonth && (month < first || month > current)) return fail('Choose the current month or one of the previous 35 months.');
  const data = {};
  for (const key of fields) {
    const raw = body[key] ?? '';
    if (typeof raw !== 'string' || raw.length > 5000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw)) return fail('One of the report fields is invalid or too long.');
    let value = raw.trim();
    if (counts.has(key) && value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1000000000)) return fail('Vehicle and complaint counts must be whole numbers of zero or more.');
    if (amounts.has(key) && value) {
      // Accept familiar UK amount input without accepting formulas or arbitrary text.
      if (!/^(?:£\s*)?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return fail('Enter money amounts as zero or positive numbers, with at most two decimal places.');
      value = value.replace(/^£\s*/, '').replace(/,/g, '');
      if (Number(value) > 1000000000000) return fail('The money amount is too large.');
    }
    if (key === 'finance_complaints' && !['','Yes','No'].includes(value)) return fail('Choose Yes or No for finance complaints.');
    if (key === 'changes_since_last_month' && !['','Yes','None'].includes(value)) return fail('Choose Yes or None for changes.');
    data[key] = value;
  }
  // Only permitted fields are saved; never store CSRF tokens, declarations or arbitrary keys.
  return { month, data };
}
module.exports = { fields, validate };
