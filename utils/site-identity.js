'use strict';
const identity = require('../config/site-identity.json');

function filled(value) {
  return typeof value === 'string' && !/[{}]/.test(value) && value.trim() ? value.trim() : undefined;
}

function profileUrl(value, base) {
  const text = filled(value);
  if (!text) return undefined;
  try {
    const url = new URL(text, base);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function people(origin) {
  return Object.entries(identity.team).flatMap(([anchor, details]) => {
    const name = filled(details.name);
    if (!name || !/^[a-z][a-z0-9-]*$/.test(anchor)) return [];
    const url = origin + '/about#' + anchor;
    const linkedIn = profileUrl(details.linkedIn);
    return [{ '@type': 'Person', '@id': url, url, name,
      jobTitle: filled(details.jobTitle), description: filled(details.background),
      image: profileUrl(details.photo, origin), sameAs: linkedIn ? [linkedIn] : undefined }];
  });
}

function organization(origin) {
  return { '@context': 'https://schema.org', '@type': 'Organization', '@id': origin + '/#organization',
    name: '009 Compliance', legalName: '009 Compliance Ltd', url: origin, logo: origin + '/images/logo1resized.png',
    description: 'Administrative assistance for UK motor dealers with FCA authorisation, regulatory reporting and ongoing compliance.',
    foundingDate: identity.foundingDate, areaServed: { '@type': 'Country', name: 'GB' },
    identifier: { '@type': 'PropertyValue', propertyID: 'Companies House company number', value: '16910484' },
    sameAs: ['https://find-and-update.company-information.service.gov.uk/company/16910484',
      profileUrl(identity.companyLinkedIn), profileUrl(identity.googleBusinessProfile)].filter(Boolean),
    email: 'info@009compliance.com', telephone: '03300432377', address: { '@type': 'PostalAddress',
      streetAddress: 'Hilton Jones Hollinwood Business Centre, Albert Street', addressLocality: 'Oldham', postalCode: 'OL8 3QL', addressCountry: 'GB' } };
}

module.exports = { people, organization, identity };
