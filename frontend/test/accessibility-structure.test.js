const assert = require('assert');
const fs = require('fs');
const path = require('path');

const homePath = path.join(__dirname, '..', 'index.html');
const homeHtml = fs.readFileSync(homePath, 'utf8');
const nafdacPath = path.join(__dirname, '..', 'nafdac-registration.html');
const nafdacHtml = fs.readFileSync(nafdacPath, 'utf8');
const pmsPath = path.join(__dirname, '..', 'post-marketing-surveillance.html');
const pmsHtml = fs.readFileSync(pmsPath, 'utf8');
const servicesPath = path.join(__dirname, '..', 'services', 'index.html');
const servicesHtml = fs.readFileSync(servicesPath, 'utf8');
const resourcesPath = path.join(__dirname, '..', 'resources', 'index.html');
const resourcesHtml = fs.readFileSync(resourcesPath, 'utf8');
const medicalInfoPath = path.join(__dirname, '..', 'medical-information.html');
const medicalInfoHtml = fs.readFileSync(medicalInfoPath, 'utf8');
const medicalWritingPath = path.join(__dirname, '..', 'medical-writing.html');
const medicalWritingHtml = fs.readFileSync(medicalWritingPath, 'utf8');

const schemaPages = [
  ['index.html', homeHtml],
  ['services/index.html', servicesHtml],
  ['pv.html', fs.readFileSync(path.join(__dirname, '..', 'pv.html'), 'utf8')],
  ['cro.html', fs.readFileSync(path.join(__dirname, '..', 'cro.html'), 'utf8')],
  ['regulatory.html', fs.readFileSync(path.join(__dirname, '..', 'regulatory.html'), 'utf8')],
  ['medical-information.html', medicalInfoHtml],
  ['nafdac-registration.html', nafdacHtml],
  ['post-marketing-surveillance.html', pmsHtml],
  ['regulatory-intelligence.html', fs.readFileSync(path.join(__dirname, '..', 'regulatory-intelligence.html'), 'utf8')],
  ['training-consulting.html', fs.readFileSync(path.join(__dirname, '..', 'training-consulting.html'), 'utf8')],
  ['compliance-checklist.html', fs.readFileSync(path.join(__dirname, '..', 'compliance-checklist.html'), 'utf8')]
];

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

assert.ok(homeHtml.includes('<main'), 'Homepage should include a semantic main landmark.');
assert.ok(homeHtml.indexOf('<meta charset="UTF-8">') !== -1, 'Homepage should declare the UTF-8 charset.');
assert.ok(homeHtml.includes('role="dialog"') && homeHtml.includes('aria-modal="true"'), 'Consultation dialog should expose dialog semantics.');
assert.ok(homeHtml.includes('id="consultationModal"') && homeHtml.includes('aria-hidden="true"') && homeHtml.includes('hidden') && homeHtml.includes('inert'), 'Closed consultation modal should be removed from assistive tech and keyboard navigation.');
assert.ok(nafdacHtml.includes('<section id="services"'), 'NAFDAC registration page should include a services overview section.');
assert.ok(nafdacHtml.includes('<section id="why"'), 'NAFDAC registration page should include a why-choose section.');
assert.ok(nafdacHtml.includes('<section id="faq"'), 'NAFDAC registration page should include a FAQ section.');
assert.ok(nafdacHtml.includes('application/ld+json'), 'NAFDAC registration page should include structured data.');
assert.ok(pmsHtml.includes('<section id="services"'), 'Post-marketing surveillance page should include a services overview section.');
assert.ok(pmsHtml.includes('<section id="faq"'), 'Post-marketing surveillance page should include a FAQ section.');
assert.ok(resourcesHtml.includes('<section') && resourcesHtml.includes('Resources & Insights') && resourcesHtml.includes('Featured Categories'), 'Resources page should include the hero and featured categories sections.');
assert.ok(medicalInfoHtml.includes('<section id="services"'), 'Medical information page should include a services overview section.');
assert.ok(medicalInfoHtml.includes('<section id="faq"'), 'Medical information page should include a FAQ section.');
assert.ok(medicalWritingHtml.includes('Featured Resources'), 'Medical writing page should include a featured resources section.');
assert.ok(homeHtml.includes('/resources/'), 'Homepage navigation should include a Resources link.');
assert.ok(resourcesHtml.includes('/qppv-nigeria.html'), 'Resources page should include a card linking to the QPPV article.');
assert.ok(servicesHtml.includes('/post-marketing-surveillance.html'), 'Services hub should link the post-marketing card to the new page.');
assert.ok(servicesHtml.includes('/medical-information.html'), 'Services hub should link the medical information card to the new page.');
assert.ok(servicesHtml.includes('/resources/'), 'Services hub should expose the resources section.');
assert.ok(pmsHtml.includes('/#book-consultation'), 'Post-marketing surveillance page should route consultation CTAs to the home page booking section.');

for (const [relativePath, html] of schemaPages) {
  const localBusinessCount = countOccurrences(html, '"@type": "LocalBusiness"') + countOccurrences(html, '"@type":"LocalBusiness"');
  assert.ok(localBusinessCount === 1, `${relativePath} should expose exactly one LocalBusiness schema.`);
  assert.ok(html.includes('"address": {') || html.includes('"address" : {'), `${relativePath} should include a PostalAddress block.`);
  assert.ok(html.includes('"streetAddress": "17 Aje Road"'), `${relativePath} should include streetAddress from the verified business address.`);
  assert.ok(html.includes('"addressLocality": "Yaba"'), `${relativePath} should include addressLocality from the verified business address.`);
  assert.ok(html.includes('"addressCountry": "NG"'), `${relativePath} should include addressCountry from the verified business address.`);
  assert.ok(html.includes('"telephone": "+2349110225555"'), `${relativePath} should include the verified telephone number.`);
  assert.ok(html.includes('"url": "https://mednovalife.com"'), `${relativePath} should include the verified business URL.`);
}

console.log('Accessibility structure checks passed.');
