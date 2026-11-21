'use strict';
const guides = require('../config/guide-content.json');
const hub = '/guides';
const overview = '/fca-compliance-motor-dealers-guide';
const preparation = new Set(['/fca-application-documents-motor-dealers', '/why-fca-applications-get-delayed']);
const groups = [
  { id: 'permissions', title: 'FCA authorisation and permissions', links: [] },
  { id: 'preparation', title: 'Application preparation', links: [] },
  { id: 'reporting', title: 'CCR009 reporting', links: [] },
  { id: 'ongoing', title: 'Ongoing compliance', links: [] }
];
for (const [href, guide] of Object.entries(guides)) {
  if (href === overview) continue;
  const category = guide.navigationGroup || (guide.group === 'ccr' ? 'reporting' : guide.group === 'fca' ? preparation.has(href) ? 'preparation' : 'permissions' : 'ongoing');
  (groups.find(group => group.id === category) || groups[3]).links.push({ href, title: guide.title, description: guide.description });
}
module.exports = { hub, overview, groups };
