'use strict';
const annotations = require('../config/guide-links.json');

// Return text pieces, never HTML. EJS escapes both text and href when rendering.
// Positions refer to unchanged source paragraphs; missing phrases remain plain text.
function paragraphParts(route, sectionId, paragraph, text) {
  const links = (annotations[route] || []).filter(link => link.sectionId === sectionId && link.paragraph === paragraph);
  const matches = links.map(link => ({...link, start: text.indexOf(link.text)})).filter(link => link.start >= 0).sort((a,b) => a.start-b.start);
  const parts = [];
  let end = 0;
  for (const link of matches) {
    if (link.start < end) continue;
    if (link.start > end) parts.push({text:text.slice(end,link.start)});
    parts.push({text:link.text,href:link.href});
    end = link.start + link.text.length;
  }
  if (end < text.length) parts.push({text:text.slice(end)});
  return parts;
}
module.exports = {paragraphParts};
