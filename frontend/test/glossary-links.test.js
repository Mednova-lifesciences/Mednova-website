const assert = require('assert');
const fs = require('fs');
const path = require('path');

const glossaryDir = path.join(__dirname, '..', 'resources', 'glossary');
const glossaryFiles = fs.readdirSync(glossaryDir).filter((file) => file.endsWith('.html'));
const glossaryPageSet = new Set(glossaryFiles.map((file) => file.toLowerCase()));

const requiredPages = [
  'adverse-drug-reaction.html',
  'aggregate-reporting.html',
  'clinical-trial.html',
  'good-clinical-practice.html',
  'good-pharmacovigilance-practice.html',
  'nafdac.html',
  'pbrer.html',
  'psur.html',
  'regulatory-affairs.html',
  'risk-management-plan.html'
];

function checkGlossaryLinks(fileName) {
  const fullPath = path.join(glossaryDir, fileName);
  const html = fs.readFileSync(fullPath, 'utf8');
  const hrefMatches = [...html.matchAll(/href="(\/resources\/glossary\/[^"#]+)"/g)];
  const broken = [];

  for (const match of hrefMatches) {
    const targetPath = match[1].replace(/^\/resources\/glossary\//, '');
    if (!glossaryPageSet.has(targetPath.toLowerCase())) {
      broken.push(match[1]);
    }
  }

  return broken;
}

requiredPages.forEach((page) => {
  assert.ok(glossaryPageSet.has(page.toLowerCase()), `Expected glossary page to exist: ${page}`);
});

const indexBroken = checkGlossaryLinks('index.html');
assert.deepStrictEqual(indexBroken, [], `Broken glossary links found in index.html: ${indexBroken.join(', ')}`);

const glossaryIndexHtml = fs.readFileSync(path.join(glossaryDir, 'index.html'), 'utf8');
assert.ok(glossaryIndexHtml.includes('./glossary-search.js'), 'Glossary index should reference the glossary search script from the glossary directory.');
assert.ok(fs.existsSync(path.join(glossaryDir, 'glossary-search.js')), 'Glossary search script should exist in the glossary directory.');

const otherPages = glossaryFiles.filter((file) => file !== 'index.html');
for (const page of otherPages) {
  const brokenLinks = checkGlossaryLinks(page);
  assert.deepStrictEqual(brokenLinks, [], `Broken glossary links found in ${page}: ${brokenLinks.join(', ')}`);
}

console.log(`Glossary link audit passed for ${requiredPages.length} required glossary pages.`);
