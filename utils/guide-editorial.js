'use strict';

// Apply only to explicitly selected visible guide text, before EJS escapes it.
// Never pass HTML, attributes, URLs, metadata, schema or customer quotations here.
// This reviewed list avoids changing unknown compounds/identifiers in future copy.
const optionalCompounds = new Set([
  '15-minute', '40-business-day', 'fca-prescribed', 'firm-specific',
  'full-permission', 'january-to-december', 'limited-permission', 'motor-finance',
  'non-owned', 'october-to-september', 'part-exchange', 'post-approval',
  'six-month', 'working-record', 'appointed-representative',
  'authorisation-assistance', 'broker-only', 'calendar-based',
  'complaints-reporting', 'consumer-credit', 'credit-broking', 'credit-related',
  'cross-cutting', 'customer-facing', 'data-flow', 'data-protection', 'end-to-end',
  'fair-use', 'financial-promotion', 'financial-services', 'first-month',
  'first-period', 'follow-up', 'key-data', 'larger-firm', 'last-minute',
  'motor-dealer', 'non-owned-stock', 'not-for-profit', 'one-page', 'part-exchanges',
  'permission-based', 'reporting-cycle', 'source-check', 'source-record',
  'supporting-material', 'third-party', 'twice-yearly', 'vehicle-sourcing',
  'vulnerable-customer', 'year-end'
]);

function guideText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\s+—\s+/g, ': ')
    .replace(/—/g, ', ')
    .replace(/four-\/ten-month|[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+/gu,
      compound => optionalCompounds.has(compound.toLowerCase()) ? compound.replace(/-/g, ' ') : compound);
}

module.exports = { guideText };
