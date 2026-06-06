const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tmp = path.join(root, '_test_map.js');
const code = fs.readFileSync(path.join(root, 'companies.js'), 'utf8') + '\nmodule.exports = COMPANY_MAP;';
fs.writeFileSync(tmp, code);
const COMPANY_MAP = require(tmp);
fs.unlinkSync(tmp);

const keys = Object.keys(COMPANY_MAP).sort((a, b) => b.length - a.length);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

console.time('build');
const pattern = new RegExp('\\b(' + keys.map(escapeRegex).join('|') + ')\\b', 'gi');
console.timeEnd('build');

const text = 'Apple reported earnings while Amazon stock surged and Meta announced AI.';
console.time('match');
const matches = [];
let m;
while ((m = pattern.exec(text)) !== null) {
  matches.push(m[0]);
}
console.timeEnd('match');
console.log('Matches:', matches);
