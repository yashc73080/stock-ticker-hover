/**
 * Smoke tests for pattern matching and key data integrity.
 * Run: node scripts/smoke-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

// Load COMPANY_MAP
const mapCode = fs.readFileSync(path.join(root, 'companies.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(mapCode, sandbox);
const COMPANY_MAP = sandbox.COMPANY_MAP;

// Load compromise
const nlpCode = fs.readFileSync(path.join(root, 'vendor/compromise.min.js'), 'utf8');
const nlpSandbox = { module: {}, exports: {}, define: undefined };
vm.runInNewContext(nlpCode, nlpSandbox);
const nlp = nlpSandbox.module.exports.default || nlpSandbox.module.exports;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const sortedKeys = Object.keys(COMPANY_MAP).sort((a, b) => b.length - a.length);
const pattern = new RegExp('\\b(' + sortedKeys.map(escapeRegex).join('|') + ')\\b', 'gi');

const tests = [
  { text: 'Apple reported strong earnings this quarter.', expect: 'AAPL' },
  { text: 'I ate an apple for lunch today.', expect: null },
  { text: 'Meta Platforms announced a new AI product.', expect: 'META' },
  { text: 'The Amazon river flows through Brazil.', expect: null },
  { text: 'Amazon stock surged after earnings.', expect: 'AMZN' },
  { text: 'OpenAI released a new model.', expect: 'null' },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  pattern.lastIndex = 0;
  const match = pattern.exec(t.text);
  if (!t.expect) {
    if (!match) {
      console.log('PASS:', t.text.slice(0, 50));
      passed++;
    } else {
      console.log('FAIL:', t.text, '- matched', match[0], 'expected no match');
      failed++;
    }
    continue;
  }

  if (!match) {
    console.log('FAIL:', t.text, '- no match, expected', t.expect);
    failed++;
    continue;
  }

  const ticker = COMPANY_MAP[match[0].toLowerCase()];
  const tickerStr = ticker === null ? 'null' : ticker;
  if (tickerStr === t.expect) {
    console.log('PASS:', t.text.slice(0, 50), '->', tickerStr);
    passed++;
  } else {
    console.log('FAIL:', t.text, '- got', tickerStr, 'expected', t.expect);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed (dictionary layer only)`);
process.exit(failed > 0 ? 1 : 0);
