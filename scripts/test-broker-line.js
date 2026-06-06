const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'companies.js'), 'utf8');
const tmp = path.join(root, '_test_map.js');
fs.writeFileSync(tmp, code + '\nmodule.exports = { COMPANY_MAP, TRUSTED_BRAND_WORDS };');
const { COMPANY_MAP } = require(tmp);
fs.unlinkSync(tmp);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const keys = Object.keys(COMPANY_MAP).sort((a, b) => b.length - a.length);
const pattern = new RegExp('\\b(' + keys.map(escapeRegex).join('|') + ')\\b', 'gi');

const text = "In the US, you will be able to buy through Charles Schwab, Fidelity, Robinhood, SoFi Technologies, and Morgan Stanley's E*Trade.";

const matches = [];
let m;
pattern.lastIndex = 0;
while ((m = pattern.exec(text)) !== null) {
  matches.push({ text: m[0], ticker: COMPANY_MAP[m[0].toLowerCase()] });
}

console.log('Matches found:');
for (const hit of matches) {
  console.log(' ', hit.text, '->', hit.ticker);
}

const expected = ['Charles Schwab', 'Fidelity', 'Robinhood', 'SoFi Technologies', 'Morgan Stanley'];
for (const name of expected) {
  const found = matches.some((h) => h.text.toLowerCase() === name.toLowerCase());
  console.log(found ? 'PASS' : 'MISS', name);
}
