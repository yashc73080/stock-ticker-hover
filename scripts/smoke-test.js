/**
 * Tests stricter matching rules (dictionary + context scoring).
 * Run: node scripts/smoke-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const tmp = path.join(root, '_test_map.js');
const code = fs.readFileSync(path.join(root, 'companies.js'), 'utf8') + '\nmodule.exports = COMPANY_MAP;';
fs.writeFileSync(tmp, code);
const COMPANY_MAP = require(tmp);
fs.unlinkSync(tmp);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const keys = Object.keys(COMPANY_MAP).sort((a, b) => b.length - a.length);
const pattern = new RegExp('\\b(' + keys.map(escapeRegex).join('|') + ')\\b', 'gi');

const FINANCIAL_SIGNALS = new Set([
  'shares', 'stock', 'ceo', 'earnings', 'reported', 'revenue', 'investors',
]);
const COMMON_NOUN_SIGNALS = new Set([
  'pie', 'recipe', 'baked', 'fruit', 'river', 'forest', 'delicious',
]);

function getContextScore(text, matchIndex, matchLength) {
  const beforeText = text.slice(0, matchIndex).toLowerCase();
  const afterText = text.slice(matchIndex + matchLength).toLowerCase();
  const contextTokens = [
    ...beforeText.replace(/[^\w\s$&.-]/g, ' ').split(/\s+/).filter(Boolean).slice(-5),
    ...afterText.replace(/[^\w\s$&.-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5),
  ];
  let score = 0;
  for (const token of contextTokens) {
    if (FINANCIAL_SIGNALS.has(token)) score += 1;
    if (COMMON_NOUN_SIGNALS.has(token)) score -= 1;
  }
  if (/\b(live|breaking)\s+(updates|coverage|blog|stream|feed)\b/.test(beforeText + ' ' + afterText)) score -= 2;
  if (/\bbest\s+(of|for|ways|tips|recipes|practices|products|deals)\b/.test(beforeText)) score -= 2;
  if (/\b\d{1,2}\s*(am|pm)\b/.test(beforeText + afterText)) score -= 3;
  return score;
}

function findMatch(text) {
  pattern.lastIndex = 0;
  return pattern.exec(text);
}

const dictionaryTests = [
  { text: 'Best Apple Pie Recipe for beginners.', expect: null },
  { text: 'Live updates from the scene continue.', expect: null },
  { text: 'Meeting at 3 PM tomorrow afternoon.', expect: null },
  { text: 'AMD reported record chip revenue this quarter.', expect: 'AMD' },
  { text: 'MSI shares rose after earnings beat.', expect: 'MSI' },
  { text: 'Turn it on before you leave.', expect: null },
  { text: 'Apple reported strong earnings this quarter.', expect: 'AAPL' },
  { text: 'Meta Platforms announced a new AI product.', expect: 'META' },
  { text: 'The Amazon river flows through Brazil.', expect: null },
];

let passed = 0;
let failed = 0;

for (const t of dictionaryTests) {
  const match = findMatch(t.text);
  if (!t.expect) {
    if (!match) {
      console.log('PASS (no match):', t.text.slice(0, 55));
      passed++;
    } else {
      const score = getContextScore(t.text, match.index, match[0].length);
      if (score < 0) {
        console.log('PASS (blocked by context):', t.text.slice(0, 55), '-', match[0]);
        passed++;
      } else {
        console.log('FAIL:', t.text, '- matched', match[0], 'score', score);
        failed++;
      }
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
    console.log('PASS:', t.text.slice(0, 55), '->', tickerStr);
    passed++;
  } else {
    console.log('FAIL:', t.text, '- got', tickerStr, 'expected', t.expect);
    failed++;
  }
}

const removed = ['best', 'it', 'live', 'pm', 'on'].filter((k) => k in COMPANY_MAP);
if (removed.length) {
  console.log('FAIL: blocked keys still present:', removed.join(', '));
  failed++;
} else {
  console.log('PASS: removed ambiguous short keys');
  passed++;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
