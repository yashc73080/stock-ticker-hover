const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'companies.js'), 'utf8') + '\nmodule.exports = COMPANY_MAP;';
const tmp = path.join(root, '_test_map.js');
fs.writeFileSync(tmp, code);
const map = require(tmp);
fs.unlinkSync(tmp);

console.log('Keys:', Object.keys(map).length);
console.log('apple:', map.apple, 'openai:', map.openai, 'meta:', map.meta);
