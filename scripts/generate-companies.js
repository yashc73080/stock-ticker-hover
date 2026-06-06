const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fetchSymbolsFlag = args.includes('--fetch-symbols');
const csvArg = args.find((a) => !a.startsWith('--'));
const defaultCsvPath = path.join(__dirname, 'constituents.csv');
const map = {};
const BLOCKED_KEYS = new Set([
  'a', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it',
  'me', 'my', 'no', 'of', 'ok', 'on', 'or', 'pm', 'am', 'so', 'to', 'up', 'us',
  'we', 'all', 'any', 'are', 'bad', 'best', 'big', 'box', 'can', 'cat', 'day',
  'did', 'due', 'end', 'far', 'fit', 'fix', 'fly', 'for', 'fun', 'gas', 'get',
  'got', 'guy', 'had', 'has', 'her', 'him', 'his', 'hit', 'hot', 'how', 'job',
  'key', 'kid', 'law', 'lay', 'led', 'let', 'live', 'log', 'lot', 'low', 'mad',
  'man', 'map', 'max', 'may', 'mid', 'mix', 'net', 'new', 'nor', 'not', 'now',
  'nut', 'odd', 'off', 'oil', 'old', 'one', 'opt', 'our', 'out', 'own', 'par',
  'pay', 'pen', 'per', 'pet', 'pop', 'pot', 'pro', 'raw', 'red', 'rid', 'row',
  'rub', 'run', 'sad', 'sat', 'saw', 'say', 'sea', 'see', 'set', 'she', 'sit',
  'six', 'ski', 'sky', 'son', 'sub', 'sum', 'sun', 'tab', 'tag', 'tan', 'tap',
  'tax', 'tea', 'ten', 'the', 'tie', 'tip', 'toe', 'ton', 'too', 'top', 'toy',
  'try', 'two', 'use', 'van', 'via', 'war', 'was', 'way', 'web', 'wet', 'who',
  'why', 'win', 'wit', 'won', 'yet', 'you', 'air', 'art', 'bus', 'cut', 'add',
  'ice', 'fair', 'fast', 'host', 'home', 'bank', 'news', 'well', 'tech',
  'deck', 'ball', 'pool', 'iron', 'lite', 'arch', 'hood', 'dash', 'real',
  'park', 'snow', 'work', 'play', 'trip', 'match', 'snap', 'trade', 'block',
  'take', 'food', 'auto', 'gold', 'land', 'wood', 'glass', 'paper', 'power',
  'water', 'health', 'digital', 'public', 'storage', 'energy', 'science',
  'general', 'american', 'national', 'international', 'united', 'global',
  'union', 'european', 'pacific', 'atlantic', 'southern', 'northern', 'eastern',
  'western', 'central', 'capital', 'financial', 'mutual', 'royal', 'premier',
  'premiere', 'standard', 'community', 'citizens', 'farmers',
  'first', 'principal', 'progress', 'discovery', 'entergy', 'domain',
  'fidelity', // Fidelity Investments is private; don't conflate with FIS
  'able', 'will', 'through', 'being', 'their', 'there', 'where', 'which',
  'while', 'would', 'could', 'should', 'about', 'after', 'before', 'other',
  'some', 'such', 'than', 'that', 'this', 'with', 'from', 'have', 'been',
  'more', 'most', 'only', 'over', 'also', 'just', 'like', 'make', 'made',
  'many', 'much', 'must', 'need', 'open', 'part', 'same', 'seem', 'take',
  'very', 'want', 'what', 'when', 'your', 'year', 'years', 'back', 'come',
  'does', 'done', 'each', 'even', 'find', 'give', 'good', 'help', 'here',
  'high', 'keep', 'know', 'last', 'long', 'look', 'next', 'plan', 'read',
  'right', 'said', 'show', 'still', 'team', 'tell', 'them', 'then', 'they',
  'think', 'time', 'under', 'used', 'using', 'want', 'week', 'well', 'were',
  'work', 'world', 'able', 'both', 'call', 'case', 'days', 'does', 'down',
  'find', 'first', 'found', 'going', 'great', 'group', 'hand', 'head', 'held',
  'hold', 'home', 'idea', 'include', 'into', 'item', 'kind', 'know', 'large',
  'late', 'lead', 'less', 'life', 'line', 'link', 'list', 'little', 'local',
  'major', 'might', 'mind', 'move', 'name', 'near', 'need', 'never', 'note',
  'once', 'order', 'part', 'past', 'place', 'point', 'post', 'real', 'rest',
  'room', 'rule', 'said', 'same', 'save', 'seen', 'self', 'side', 'sign',
  'site', 'size', 'sort', 'star', 'start', 'state', 'step', 'stop', 'sure',
  'term', 'test', 'text', 'turn', 'type', 'unit', 'upon', 'used', 'user',
  'view', 'vote', 'wait', 'walk', 'wall', 'want', 'ways', 'week', 'wide',
  'wife', 'wind', 'wine', 'wing', 'wire', 'wise', 'wish', 'word', 'work',
  'yard', 'yeah', 'your', 'zero', 'zone',
]);

// Single-word brand names — safe to match without always needing "Inc." suffix.
// Also emitted as TRUSTED_BRAND_WORDS for content.js disambiguation.
const BRAND_ALIASES = {
  apple: 'AAPL',
  dell: 'DELL',
  amazon: 'AMZN',
  microsoft: 'MSFT',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  meta: 'META',
  facebook: 'META',
  tesla: 'TSLA',
  nvidia: 'NVDA',
  intel: 'INTC',
  amd: 'AMD',
  msi: 'MSI',
  ibm: 'IBM',
  oracle: 'ORCL',
  salesforce: 'CRM',
  cisco: 'CSCO',
  qualcomm: 'QCOM',
  broadcom: 'AVGO',
  micron: 'MU',
  netflix: 'NFLX',
  disney: 'DIS',
  starbucks: 'SBUX',
  walmart: 'WMT',
  costco: 'COST',
  target: 'TGT',
  uber: 'UBER',
  lyft: 'LYFT',
  airbnb: 'ABNB',
  shopify: 'SHOP',
  palantir: 'PLTR',
  snowflake: 'SNOW',
  paypal: 'PYPL',
  boeing: 'BA',
  chevron: 'CVX',
  exxon: 'XOM',
  exxonmobil: 'XOM',
  pfizer: 'PFE',
  moderna: 'MRNA',
  merck: 'MRK',
  abbvie: 'ABBV',
  nike: 'NKE',
  spotify: 'SPOT',
  snap: 'SNAP',
  pinterest: 'PINS',
  roblox: 'RBLX',
  coinbase: 'COIN',
  robinhood: 'HOOD',
  schwab: 'SCHW',
  sofi: 'SOFI',
  rivian: 'RIVN',
  lucid: 'LCID',
  zoom: 'ZM',
  datadog: 'DDOG',
  crowdstrike: 'CRWD',
  hp: 'HPQ',
  lenovo: 'LNVGY',
  bp: 'BP',
  ge: 'GE',
  gm: 'GM',
  sap: 'SAP',
  tsmc: 'TSM',
  asml: 'ASML',
  sony: 'SONY',
  toyota: 'TM',
  honda: 'HMC',
  samsung: 'SSNLF',
  nintendo: 'NTDOY',
};

function addKey(key, ticker) {
  key = key.toLowerCase().trim();
  if (!key || key.length < 4) return;
  if (BLOCKED_KEYS.has(key)) return;
  if (!(key in map)) map[key] = ticker;
}

function addAlternate(key, ticker) {
  key = key.toLowerCase().trim();
  if (!key || key.length < 2) return;
  // Allow null overrides (e.g. fidelity → private) even for blocklisted keys.
  if (ticker !== null && BLOCKED_KEYS.has(key)) return;
  map[key] = ticker;
}

function cleanName(name) {
  return name
    .replace(/\(Class [A-C]\)/gi, '')
    .replace(
      /,?\s*(Inc\.?|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|PLC|LP|LLC|Holdings|Group|Technologies|Technology|Industries|Industrial|Services|Systems|Solutions|Enterprises|International|Global|Brands|Motors|Labs|Platforms|Communications|Bancorp|Bancshares|& Co\.?)\.?$/gi,
      '',
    )
    .trim();
}

function addFirstWord(name, ticker) {
  const word = cleanName(name).split(/[\s/]+/)[0];
  if (word && word.length >= 4 && !BLOCKED_KEYS.has(word.toLowerCase())) {
    addKey(word, ticker);
  }
}

function loadConstituents(csvPath) {
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.trim().split('\n').slice(1);

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
    addFirstWord(security, ticker);
  }
}

function loadAlternates() {
  const alternates = {
  ...BRAND_ALIASES,
  'meta platforms': 'META',
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
  'wal-mart': 'WMT',
  'home depot': 'HD',
  lowes: 'LOW',
  "lowe's": 'LOW',
  'walt disney': 'DIS',
  'advanced micro devices': 'AMD',
  'motorola solutions': 'MSI',
  'micron technology': 'MU',
  visa: 'V',
  mastercard: 'MA',
  'american express': 'AXP',
  amex: 'AXP',
  'lockheed martin': 'LMT',
  raytheon: 'RTX',
  'general electric': 'GE',
  'general motors': 'GM',
  'ford motor': 'F',
  'exxon mobil': 'XOM',
  conocophillips: 'COP',
  'eli lilly': 'LLY',
  unitedhealth: 'UNH',
  'unitedhealth group': 'UNH',
  anthem: 'ELV',
  'elevance health': 'ELV',
  cigna: 'CI',
  humana: 'HUM',
  'taiwan semiconductor': 'TSM',
  'taiwan semiconductor manufacturing': 'TSM',
  'samsung electronics': 'SSNLF',
  'toyota motor': 'TM',
  'asml holding': 'ASML',
  siemens: 'SIEGY',
  shell: 'SHEL',
  'royal dutch shell': 'SHEL',
  total: 'TTE',
  totalenergies: 'TTE',
  nestle: 'NSRGY',
  unilever: 'UL',
  'best buy': 'BBY',
  'live nation': 'LYV',
  'live nation entertainment': 'LYV',
  'on semiconductor': 'ON',
  'philip morris': 'PM',
  'philip morris international': 'PM',
  'sofi technologies': 'SOFI',
  fidelity: null,
  etrade: 'MS',
  'e*trade': 'MS',
  openai: null,
  spacex: null,
  anthropic: null,
  stripe: null,
  databricks: null,
  bytedance: null,
  tiktok: null,
  xai: null,
  };

  for (const [key, ticker] of Object.entries(alternates)) {
    addAlternate(key, ticker);
  }
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function addUsSymbols() {
  const extraPath = path.join(__dirname, 'us-symbols.txt');
  if (!fs.existsSync(extraPath)) return;

  const text = fs.readFileSync(extraPath, 'utf8');
  for (const line of text.trim().split('\n').slice(1)) {
    const [symbol, name] = line.split('|');
    if (!symbol || !name) continue;
    if (symbol.includes('File Creation')) continue;
    const ticker = symbol.trim();
    const security = name.trim();
    // Bulk import: full names only — no firstWord (too many false positives).
    addKey(security, ticker);
    addKey(cleanName(security), ticker);
  }
}

async function main() {
  loadConstituents(csvArg || defaultCsvPath);
  loadAlternates();

  if (fetchSymbolsFlag) {
    const [nasdaq, other] = await Promise.all([
      fetchText('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt'),
      fetchText('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'),
    ]);
    const merged = [nasdaq.trim(), other.trim()].join('\n');
    fs.writeFileSync(path.join(__dirname, 'us-symbols.txt'), merged);
    console.log('Fetched US symbol lists to scripts/us-symbols.txt');
  }

  await addUsSymbols();

  const trustedBrands = Object.keys(BRAND_ALIASES).sort();
  const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));

  let out = 'const COMPANY_MAP = {\n';
  for (const [k, v] of entries) {
    const val = v === null ? 'null' : JSON.stringify(v);
    out += `  ${JSON.stringify(k)}: ${val},\n`;
  }
  out += '};\n\n';
  out += 'const TRUSTED_BRAND_WORDS = new Set([\n';
  for (const brand of trustedBrands) {
    out += `  ${JSON.stringify(brand)},\n`;
  }
  out += ']);\n';

  fs.writeFileSync(path.join(root, 'companies.js'), out);
  console.log('Wrote', entries.length, 'keys and', trustedBrands.length, 'trusted brands');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
