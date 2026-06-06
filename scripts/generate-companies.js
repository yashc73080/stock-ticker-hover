const fs = require('fs');
const path = require('path');

const csvPath = process.argv[2] || path.join(__dirname, 'constituents.csv');
const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.trim().split('\n').slice(1);
const map = {};

function addKey(key, ticker) {
  key = key.toLowerCase().trim();
  if (!key || key.length < 2) return;
  if (!(key in map)) map[key] = ticker;
}

function cleanName(name) {
  return name
    .replace(/\(Class [A-C]\)/gi, '')
    .replace(/,?\s*(Inc\.?|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|PLC|LP|LLC|Holdings|Group|& Co\.?)\.?$/gi, '')
    .trim();
}

for (const line of lines) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  if (parts.length < 2) continue;

  const symbol = parts[0].trim();
  const security = parts[1].trim();
  const ticker = symbol;

  addKey(security, ticker);
  addKey(cleanName(security), ticker);
  addKey(ticker.toLowerCase(), ticker);
  const firstWord = cleanName(security).split(/[\s/]+/)[0];
  if (firstWord && firstWord.length > 2) addKey(firstWord, ticker);
}

const alternates = {
  facebook: 'META',
  meta: 'META',
  'meta platforms': 'META',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  'berkshire hathaway': 'BRK.B',
  berkshire: 'BRK.B',
  'johnson & johnson': 'JNJ',
  'j&j': 'JNJ',
  'procter & gamble': 'PG',
  'p&g': 'PG',
  'at&t': 'T',
  att: 'T',
  jpmorgan: 'JPM',
  'jp morgan': 'JPM',
  'jpmorgan chase': 'JPM',
  'bank of america': 'BAC',
  bofa: 'BAC',
  'wells fargo': 'WFC',
  'goldman sachs': 'GS',
  'morgan stanley': 'MS',
  'coca-cola': 'KO',
  coke: 'KO',
  mcdonalds: 'MCD',
  "mcdonald's": 'MCD',
  walmart: 'WMT',
  'wal-mart': 'WMT',
  'home depot': 'HD',
  lowes: 'LOW',
  "lowe's": 'LOW',
  costco: 'COST',
  target: 'TGT',
  starbucks: 'SBUX',
  disney: 'DIS',
  'walt disney': 'DIS',
  netflix: 'NFLX',
  nvidia: 'NVDA',
  intel: 'INTC',
  microsoft: 'MSFT',
  apple: 'AAPL',
  amazon: 'AMZN',
  tesla: 'TSLA',
  palantir: 'PLTR',
  snowflake: 'SNOW',
  uber: 'UBER',
  lyft: 'LYFT',
  airbnb: 'ABNB',
  shopify: 'SHOP',
  salesforce: 'CRM',
  oracle: 'ORCL',
  ibm: 'IBM',
  cisco: 'CSCO',
  qualcomm: 'QCOM',
  broadcom: 'AVGO',
  amd: 'AMD',
  'advanced micro devices': 'AMD',
  micron: 'MU',
  'micron technology': 'MU',
  paypal: 'PYPL',
  visa: 'V',
  mastercard: 'MA',
  'american express': 'AXP',
  amex: 'AXP',
  boeing: 'BA',
  'lockheed martin': 'LMT',
  raytheon: 'RTX',
  'general electric': 'GE',
  ge: 'GE',
  'general motors': 'GM',
  gm: 'GM',
  ford: 'F',
  'ford motor': 'F',
  exxon: 'XOM',
  exxonmobil: 'XOM',
  'exxon mobil': 'XOM',
  chevron: 'CVX',
  conocophillips: 'COP',
  pfizer: 'PFE',
  moderna: 'MRNA',
  'eli lilly': 'LLY',
  merck: 'MRK',
  abbvie: 'ABBV',
  unitedhealth: 'UNH',
  'unitedhealth group': 'UNH',
  anthem: 'ELV',
  'elevance health': 'ELV',
  cigna: 'CI',
  humana: 'HUM',
  tsmc: 'TSM',
  'taiwan semiconductor': 'TSM',
  'taiwan semiconductor manufacturing': 'TSM',
  samsung: 'SSNLF',
  'samsung electronics': 'SSNLF',
  toyota: 'TM',
  'toyota motor': 'TM',
  asml: 'ASML',
  'asml holding': 'ASML',
  sony: 'SONY',
  honda: 'HMC',
  nintendo: 'NTDOY',
  sap: 'SAP',
  siemens: 'SIEGY',
  shell: 'SHEL',
  'royal dutch shell': 'SHEL',
  bp: 'BP',
  total: 'TTE',
  totalenergies: 'TTE',
  nestle: 'NSRGY',
  unilever: 'UL',
  openai: null,
  spacex: null,
  anthropic: null,
  stripe: null,
  databricks: null,
  bytedance: null,
  tiktok: null,
  xai: null,
};

Object.assign(map, alternates);

const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
let out = 'const COMPANY_MAP = {\n';
for (const [k, v] of entries) {
  const val = v === null ? 'null' : JSON.stringify(v);
  out += `  ${JSON.stringify(k)}: ${val},\n`;
}
out += '};\n';

const outPath = path.join(__dirname, '..', 'companies.js');
fs.writeFileSync(outPath, out);
console.log('Wrote', entries.length, 'keys to', outPath);
