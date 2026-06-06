(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────────────
  const HIGHLIGHT_CLASS = 'htt-ticker-highlight';
  const TOOLTIP_ID = 'htt-tooltip-host';
  const HOVER_DEBOUNCE_MS = 280;
  const CACHE_TTL_MS = 30_000;
  const MUTATION_DEBOUNCE_MS = 500;
  const HIDE_GRACE_MS = 150;
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE',
    'SVG', 'IFRAME', 'NOSCRIPT', 'SELECT', 'BUTTON',
  ]);
  const CONTAINER_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TD',
  ]);

  const FINANCIAL_SIGNALS = new Set([
    'shares', 'share', 'stock', 'stocks', 'ceo', 'earnings', 'quarterly',
    'announced', 'reported', 'investors', 'investor', 'revenue', 'market',
    'cap', 'acquired', 'acquisition', 'dividend', 'ipo', 'merger', 'analyst',
    'forecast', 'guidance', 'profit', 'loss', 'trading', 'nasdaq', 'nyse',
    'fiscal', 'outlook', 'beat', 'missed', 'surged', 'plunged', 'rallied',
    'valuation', 'marketplace', 'portfolio', 'fund', 'index', 'sector',
    'announces', 'launched', 'unveiled', 'posted', 'rose', 'fell',
    'buy', 'sell', 'broker', 'brokerage', 'invest', 'investing', 'trade',
  ]);

  // Standalone words that are corporate suffixes or common English — never highlight alone.
  const NEGLIGIBLE_STANDALONE_WORDS = new Set([
    'inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'llc', 'plc',
    'holdings', 'group', 'technologies', 'technology', 'industries', 'industrial',
    'systems', 'solutions', 'enterprises', 'services', 'communications', 'partners',
    'bancorp', 'bancshares', 'brands', 'motors', 'labs', 'platforms', 'union',
  ]);

  // Preceding word + match forms a non-company phrase (European Union, credit union, etc.).
  const PHRASE_PREFIX_BLOCKLIST = new Set([
    'european', 'labor', 'labour', 'credit', 'trade', 'student', 'teachers',
    'workers', 'nations', 'soviet', 'western', 'eastern', 'customs', 'monetary',
    'state', 'federal', 'international', 'world', 'parent', 'parent\'s',
  ]);

  const KNOWN_NON_COMPANY_PHRASES = new Set([
    'european union', 'credit union', 'labor union', 'labour union', 'trade union',
    'student union', 'teachers union', 'workers union', 'united nations',
    'soviet union', 'customs union', 'monetary union', 'parent union',
  ]);

  const COMMON_NOUN_SIGNALS = new Set([
    'ate', 'eat', 'eating', 'picked', 'river', 'forest', 'tree', 'fruit',
    'juice', 'species', 'plant', 'animal', 'recipe', 'delicious', 'organic',
    'wild', 'greek', 'variant', 'rainforest', 'jungle', 'farm', 'garden',
    'baked', 'cooked', 'fresh', 'sweet', 'sour', 'crisp', 'orchard', 'pie',
    'pastry', 'dessert', 'cinnamon', 'sugar', 'flour', 'butter', 'tart',
    'salad', 'soup', 'sandwich', 'breakfast', 'lunch', 'dinner', 'snack',
    'ingredient', 'tablespoon', 'teaspoon', 'oven', 'baking', 'homemade',
  ]);

  // Single-word brands — defined in companies.js, lighter disambiguation rules.
  // (TRUSTED_BRAND_WORDS global is populated by companies.js)

  const PLATFORM_LABELS = {
    yahoo: 'Yahoo Finance',
    robinhood: 'Robinhood',
    fidelity: 'Fidelity',
    schwab: 'Schwab',
    etrade: 'E*TRADE',
    sofi: 'SoFi',
    webull: 'Webull',
    tradingview: 'TradingView',
    cnbc: 'CNBC',
    marketwatch: 'MarketWatch',
  };

  const PLATFORM_URLS = {
    yahoo: (t) => `https://finance.yahoo.com/quote/${t}`,
    robinhood: (t) => `https://robinhood.com/stocks/${t}`,
    fidelity: (t) => `https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=${t}`,
    schwab: (t) => `https://www.schwab.wallst.com/research/Public/Stocks/Summary?symbol=${t}`,
    etrade: (t) => `https://us.etrade.com/etx/hw/equity/quote/${t}`,
    sofi: (t) => `https://www.sofi.com/invest/stock/${t}`,
    webull: (t) => `https://www.webull.com/quote/nasdaq-${t.toLowerCase()}`,
    tradingview: (t) => `https://www.tradingview.com/symbols/${t}/`,
    cnbc: (t) => `https://www.cnbc.com/quotes/${t}`,
    marketwatch: (t) => `https://www.marketwatch.com/investing/stock/${t}`,
  };

  const ERROR_MESSAGES = {
    NO_API_KEY: 'Add your Finnhub API key in the extension settings.',
    RATE_LIMIT: 'Rate limit reached. Try again in a moment.',
    INVALID_KEY: 'Invalid API key. Check your key in extension settings.',
    INVALID_SYMBOL: 'Quote unavailable for this symbol.',
    NETWORK_ERROR: 'Could not fetch quote. Check your connection.',
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let enabled = true;
  let platform = 'yahoo';
  const priceCache = new Map();
  const registeredContainers = new WeakSet();
  const annotatedContainers = new WeakSet();

  let companyPattern = null;
  let sortedKeys = [];
  let intersectionObserver = null;
  let tooltipHost = null;
  let tooltipEl = null;
  let hoverTimer = null;
  let hideTimer = null;
  let activeSpan = null;
  let pointerInTooltip = false;

  // ── Pattern init ───────────────────────────────────────────────────────────
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildPattern() {
    sortedKeys = Object.keys(COMPANY_MAP).sort((a, b) => b.length - a.length);
    const escaped = sortedKeys.map(escapeRegex);
    companyPattern = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
  }

  // ── Layer 2: compromise NLP ────────────────────────────────────────────────
  function getSentence(text, matchIndex) {
    const before = text.slice(0, matchIndex);
    const after = text.slice(matchIndex);
    const startMatch = before.match(/[.!?]\s+[A-Z][^.!?]*$/);
    const start = startMatch ? matchIndex - startMatch[0].length + 2 : Math.max(0, before.lastIndexOf('. ') + 2, before.lastIndexOf('! ') + 2, before.lastIndexOf('? ') + 2);
    const endRelative = after.search(/[.!?](?:\s|$)/);
    const end = endRelative === -1 ? text.length : matchIndex + endRelative + 1;
    const sentence = text.slice(Math.max(0, start === 2 ? 0 : start), end).trim();
    return sentence || text.slice(Math.max(0, matchIndex - 80), Math.min(text.length, matchIndex + 80));
  }

  function getNlpSignals(sentence, matchedText) {
    const lowerMatch = matchedText.toLowerCase();
    const signals = { hasOrg: false, hasProper: false, isCommonNoun: false };

    try {
      const doc = nlp(sentence);
      const terms = doc.json()[0]?.terms || [];

      for (const term of terms) {
        const termLower = term.text.toLowerCase();
        if (termLower !== lowerMatch) continue;
        const tags = term.tags || [];
        if (tags.includes('Organization') || tags.includes('Company')) {
          signals.hasOrg = true;
        }
        if (tags.includes('ProperNoun')) {
          signals.hasProper = true;
        }
        if (tags.includes('Noun') && !tags.includes('ProperNoun') && !tags.includes('Organization')) {
          signals.isCommonNoun = true;
        }
      }

      const orgs = doc.organizations().out('array');
      if (orgs.some((o) => orgMatchesTerm(o, matchedText))) {
        signals.hasOrg = true;
      }
    } catch {
      // fall through
    }

    return signals;
  }

  function orgMatchesTerm(orgText, matchedText) {
    const oLower = orgText.toLowerCase();
    const mLower = matchedText.toLowerCase();
    if (oLower === mLower) return true;
    // e.g. "Union Pacific" for a deliberate "Union" match — not "European Union" for "Union".
    return oLower.startsWith(mLower + ' ');
  }

  function getPrecedingWord(text, matchIndex) {
    const before = text.slice(0, matchIndex).trimEnd();
    const m = before.match(/([A-Za-z][\w&.'-]*)$/);
    return m ? m[1].toLowerCase() : null;
  }

  function isPartOfNonCompanyPhrase(text, matchIndex, matchedText) {
    const prev = getPrecedingWord(text, matchIndex);
    if (prev && PHRASE_PREFIX_BLOCKLIST.has(prev)) return true;
    if (prev) {
      const phrase = prev + ' ' + matchedText.toLowerCase();
      if (KNOWN_NON_COMPANY_PHRASES.has(phrase)) return true;
    }
    return false;
  }

  function passesCompromiseCheck(sentence, matchedText, contextScore, mapKey) {
    const lowerMatch = matchedText.toLowerCase();
    const isTrustedBrand = typeof TRUSTED_BRAND_WORDS !== 'undefined' &&
      TRUSTED_BRAND_WORDS.has(lowerMatch);
    const isMultiWord = mapKey.includes(' ') || mapKey.includes('&') || mapKey.includes('*');
    const isPrivateCompany = COMPANY_MAP[lowerMatch] === null;
    const signals = getNlpSignals(sentence, matchedText);

    if (signals.isCommonNoun && !signals.hasOrg) {
      return false;
    }

    if (contextScore < 0) {
      return false;
    }

    if (signals.hasOrg) {
      return true;
    }

    // Privately held names (Fidelity Investments, OpenAI, etc.)
    if (
      isPrivateCompany &&
      matchedText[0] === matchedText[0].toUpperCase() &&
      (signals.hasProper || signals.hasOrg)
    ) {
      return true;
    }

    // Multi-word dictionary hits (Charles Schwab, Morgan Stanley) are high confidence.
    if (
      isMultiWord &&
      matchedText[0] === matchedText[0].toUpperCase() &&
      contextScore >= 0 &&
      !signals.isCommonNoun
    ) {
      return true;
    }

    // Trusted brands (Apple, Dell, Schwab, etc.)
    if (
      isTrustedBrand &&
      signals.hasProper &&
      matchedText[0] === matchedText[0].toUpperCase()
    ) {
      return true;
    }

    if (isTrustedBrand && contextScore > 0) {
      return true;
    }

    if (signals.hasProper && contextScore > 0) {
      return true;
    }

    return false;
  }

  // ── Layer 3: context window scoring ────────────────────────────────────────
  function getContextScore(text, matchIndex, matchLength) {
    const tokens = text.toLowerCase().replace(/[^\w\s$&.-]/g, ' ').split(/\s+/).filter(Boolean);
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

    if (beforeText.includes('market cap')) score += 1;
    if (beforeText.includes('delta variant') || afterText.includes('delta variant')) score -= 2;
    if (/\b(live|breaking)\s+(updates|coverage|blog|stream|feed)\b/.test(beforeText + ' ' + afterText)) score -= 2;
    if (/\bbest\s+(of|for|ways|tips|recipes|practices|products|deals)\b/.test(beforeText)) score -= 2;
    if (/\b\d{1,2}\s*(am|pm)\b/.test(beforeText + afterText)) score -= 3;
    if (/\b(buy|trade|invest|broker|brokerage|platform|account)\b/.test(beforeText + ' ' + afterText)) {
      score += 1;
    }

    return score;
  }

  function shouldHighlight(text, match, matchIndex) {
    const matchedText = match[0];
    const key = matchedText.toLowerCase();
    if (!(key in COMPANY_MAP)) return false;

    if (!key.includes(' ') && NEGLIGIBLE_STANDALONE_WORDS.has(key)) {
      return false;
    }

    if (isPartOfNonCompanyPhrase(text, matchIndex, matchedText)) {
      return false;
    }

    // Short ticker keys (2–3 chars) must appear in ALL CAPS (AMD, MSI, IBM)
    // to avoid matching common English words (on, it, pm, etc.).
    if (key.length <= 3 && matchedText !== matchedText.toUpperCase()) {
      return false;
    }

    const score = getContextScore(text, matchIndex, matchedText.length);
    if (score < 0) return false;

    const sentence = getSentence(text, matchIndex);
    if (!passesCompromiseCheck(sentence, matchedText, score, key)) return false;

    return true;
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function hasSkippedAncestor(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.classList && el.classList.contains(HIGHLIGHT_CLASS)) return true;
      el = el.parentElement;
    }
    return false;
  }

  function hasDirectTextChild(el) {
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) return true;
    }
    return false;
  }

  function isContainer(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (CONTAINER_TAGS.has(el.tagName)) return true;
    if ((el.tagName === 'DIV' || el.tagName === 'SECTION') && hasDirectTextChild(el)) return true;
    return false;
  }

  function collectContainers(root) {
    if (!root || !enabled) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (hasSkippedAncestor(node)) return NodeFilter.FILTER_REJECT;
        if (isContainer(node)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      },
    });

    let node = walker.nextNode();
    while (node) {
      registerContainer(node);
      node = walker.nextNode();
    }
  }

  function registerContainer(container) {
    if (registeredContainers.has(container) || annotatedContainers.has(container)) return;
    registeredContainers.add(container);
    if (intersectionObserver) {
      intersectionObserver.observe(container);
    }
  }

  // ── NER scan & annotation ──────────────────────────────────────────────────
  function findMatches(text) {
    const matches = [];
    if (!companyPattern) return matches;
    companyPattern.lastIndex = 0;
    let match;
    while ((match = companyPattern.exec(text)) !== null) {
      matches.push({ index: match.index, text: match[0], length: match[0].length });
    }
    return matches;
  }

  function annotateTextNode(textNode) {
    if (hasSkippedAncestor(textNode)) return;

    const text = textNode.textContent;
    const rawMatches = findMatches(text);
    if (!rawMatches.length) return;

    const validMatches = rawMatches.filter((m) => shouldHighlight(text, [m.text], m.index));
    if (!validMatches.length) return;

    validMatches.sort((a, b) => b.index - a.index);

    const fragment = document.createDocumentFragment();
    let lastIndex = text.length;

    for (const m of validMatches) {
      const after = text.slice(m.index + m.length, lastIndex);
      if (after) fragment.insertBefore(document.createTextNode(after), fragment.firstChild);

      const key = m.text.toLowerCase();
      const ticker = COMPANY_MAP[key];
      const span = document.createElement('span');
      span.className = HIGHLIGHT_CLASS;
      span.dataset.company = m.text;
      span.dataset.ticker = ticker === null ? 'null' : ticker;
      span.textContent = m.text;
      fragment.insertBefore(span, fragment.firstChild);

      lastIndex = m.index;
    }

    if (lastIndex > 0) {
      fragment.insertBefore(document.createTextNode(text.slice(0, lastIndex)), fragment.firstChild);
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function annotateContainer(container) {
    if (annotatedContainers.has(container) || !enabled) return;
    annotatedContainers.add(container);

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        if (hasSkippedAncestor(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node);
      node = walker.nextNode();
    }

    for (const textNode of textNodes) {
      if (textNode.parentNode) annotateTextNode(textNode);
    }
  }

  function onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const container = entry.target;
      if (annotatedContainers.has(container)) {
        intersectionObserver.unobserve(container);
        continue;
      }
      annotateContainer(container);
      intersectionObserver.unobserve(container);
    }
  }

  // ── IntersectionObserver init ──────────────────────────────────────────────
  function initObserver() {
    intersectionObserver = new IntersectionObserver(onIntersect, {
      rootMargin: '0px 0px 300px 0px',
      threshold: 0,
    });
  }

  // ── MutationObserver ───────────────────────────────────────────────────────
  let mutationTimer = null;

  function initMutationObserver() {
    const observer = new MutationObserver(() => {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        if (!enabled) return;
        collectContainers(document.body);
      }, MUTATION_DEBOUNCE_MS);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Price cache ────────────────────────────────────────────────────────────
  function getCachedQuote(ticker) {
    const entry = priceCache.get(ticker);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      priceCache.delete(ticker);
      return null;
    }
    return entry.data;
  }

  function setCachedQuote(ticker, data) {
    priceCache.set(ticker, { data, timestamp: Date.now() });
  }

  function fetchQuote(ticker) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FETCH_QUOTE', ticker }, resolve);
    });
  }

  // ── Shadow DOM tooltip ─────────────────────────────────────────────────────
  const TOOLTIP_STYLES = `
    :host {
      all: initial;
      --htt-bg: rgba(12, 12, 18, 0.92);
      --htt-border: rgba(255, 255, 255, 0.08);
      --htt-text: #e2e8f0;
      --htt-muted: #94a3b8;
      --htt-accent: #3b82f6;
      --htt-green: #22c55e;
      --htt-red: #ef4444;
      --htt-width: 260px;
    }
    .tooltip {
      position: absolute;
      z-index: 2147483647;
      width: var(--htt-width);
      padding: 12px 14px;
      background: var(--htt-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--htt-border);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
      color: var(--htt-text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 150ms cubic-bezier(0.4, 0, 0.2, 1),
                  transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .tooltip.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .company-name {
      color: var(--htt-muted);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 160px;
    }
    .ticker {
      color: var(--htt-accent);
      font-weight: 700;
      font-size: 12px;
    }
    .price {
      font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .change {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 10px;
    }
    .change.positive { color: var(--htt-green); }
    .change.negative { color: var(--htt-red); }
    .stats {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .stat {
      flex: 1;
      text-align: center;
    }
    .stat-label {
      display: block;
      color: var(--htt-muted);
      font-size: 10px;
      margin-bottom: 2px;
    }
    .stat-value {
      font-size: 11px;
      font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    }
    .footer {
      color: var(--htt-muted);
      font-size: 10px;
      text-align: center;
      border-top: 1px solid var(--htt-border);
      padding-top: 8px;
      margin-top: 4px;
    }
    .footer-link {
      display: block;
      width: 100%;
      border: none;
      background: none;
      padding: 0;
      font-family: inherit;
      font-size: inherit;
      color: inherit;
      cursor: pointer;
      transition: color 150ms;
    }
    .footer-link:hover {
      color: var(--htt-accent);
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(148, 163, 184, 0.15);
      color: var(--htt-muted);
      font-size: 11px;
      margin-top: 4px;
    }
    .error-msg, .info-msg {
      color: var(--htt-muted);
      font-size: 12px;
      text-align: center;
      padding: 8px 0;
    }
    .pick-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
    }
    .pick-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--htt-border);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--htt-text);
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      text-align: left;
    }
    .pick-item:hover {
      background: rgba(59, 130, 246, 0.12);
      border-color: rgba(59, 130, 246, 0.35);
    }
    .pick-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 170px;
    }
    .pick-ticker {
      color: var(--htt-accent);
      font-weight: 600;
      font-size: 11px;
      flex-shrink: 0;
      margin-left: 8px;
    }
    .skeleton {
      height: 28px;
      border-radius: 4px;
      margin-bottom: 8px;
      background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.2s infinite;
    }
    .skeleton-sm {
      height: 16px;
      width: 60%;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;

  function ensureTooltip() {
    if (tooltipHost && document.documentElement.contains(tooltipHost)) return;

    tooltipHost = document.createElement('div');
    tooltipHost.id = TOOLTIP_ID;
    tooltipHost.style.cssText = 'position:absolute;top:0;left:0;z-index:2147483647;pointer-events:none;';
    const shadow = tooltipHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = TOOLTIP_STYLES;
    shadow.appendChild(style);

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    shadow.appendChild(tooltipEl);

    tooltipEl.addEventListener('mouseenter', () => { pointerInTooltip = true; });
    tooltipEl.addEventListener('mouseleave', () => {
      pointerInTooltip = false;
      scheduleHide();
    });

    document.documentElement.appendChild(tooltipHost);
  }

  function formatPrice(n) {
    return Number(n).toFixed(2);
  }

  function renderTooltipLoading(company, ticker) {
    tooltipEl.innerHTML = `
      <div class="header">
        <span class="company-name">${escapeHtml(company)}</span>
        <span class="ticker">${escapeHtml(ticker)}</span>
      </div>
      <div class="skeleton"></div>
      <div class="skeleton skeleton-sm"></div>
    `;
  }

  function renderTooltipLoaded(company, ticker, data) {
    const positive = data.change >= 0;
    const arrow = positive ? '▲' : '▼';
    const sign = positive ? '+' : '';
    const platformLabel = PLATFORM_LABELS[platform] || 'Yahoo Finance';

    tooltipEl.innerHTML = `
      <div class="header">
        <span class="company-name">${escapeHtml(company)}</span>
        <span class="ticker">${escapeHtml(ticker)}</span>
      </div>
      <div class="price">$${formatPrice(data.price)}</div>
      <div class="change ${positive ? 'positive' : 'negative'}">
        ${arrow} ${sign}${formatPrice(data.change)} (${sign}${formatPrice(data.changePercent)}%)
      </div>
      <div class="stats">
        <div class="stat"><span class="stat-label">High</span><span class="stat-value">$${formatPrice(data.high)}</span></div>
        <div class="stat"><span class="stat-label">Low</span><span class="stat-value">$${formatPrice(data.low)}</span></div>
        <div class="stat"><span class="stat-label">Prev</span><span class="stat-value">$${formatPrice(data.previousClose)}</span></div>
      </div>
      <button type="button" class="footer footer-link">Click to open in ${escapeHtml(platformLabel)}</button>
    `;

    tooltipEl.querySelector('.footer-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openBroker(ticker);
    });
  }

  function renderTooltipError(company, ticker, code) {
    const msg = ERROR_MESSAGES[code] || ERROR_MESSAGES.NETWORK_ERROR;
    tooltipEl.innerHTML = `
      <div class="header">
        <span class="company-name">${escapeHtml(company)}</span>
        <span class="ticker">${escapeHtml(ticker)}</span>
      </div>
      <div class="error-msg">${escapeHtml(msg)}</div>
    `;
  }

  function renderTooltipNotTraded(company) {
    tooltipEl.innerHTML = `
      <div class="header">
        <span class="company-name">${escapeHtml(company)}</span>
      </div>
      <span class="badge">Not publicly traded</span>
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function positionTooltip(span) {
    const rect = span.getBoundingClientRect();
    const tooltipWidth = 260;
    const tooltipHeight = tooltipEl.offsetHeight || 160;
    const gap = 8;

    let top = rect.bottom + gap + window.scrollY;
    let left = rect.left + window.scrollX;

    if (left + tooltipWidth > window.scrollX + window.innerWidth - 8) {
      left = window.scrollX + window.innerWidth - tooltipWidth - 8;
    }
    if (left < window.scrollX + 8) {
      left = window.scrollX + 8;
    }

    if (rect.bottom + gap + tooltipHeight > window.innerHeight) {
      top = rect.top - gap - tooltipHeight + window.scrollY;
    }

    tooltipHost.style.top = '0';
    tooltipHost.style.left = '0';
    tooltipEl.style.top = top + 'px';
    tooltipEl.style.left = left + 'px';
  }

  function showTooltip() {
    tooltipEl.classList.add('visible');
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
    activeSpan = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!pointerInTooltip) hideTooltip();
    }, HIDE_GRACE_MS);
  }

  async function handleHover(span) {
    ensureTooltip();
    activeSpan = span;

    const company = span.dataset.company;
    const ticker = span.dataset.ticker;

    positionTooltip(span);
    showTooltip();

    if (ticker === 'null') {
      renderTooltipNotTraded(company);
      return;
    }

    const cached = getCachedQuote(ticker);
    if (cached) {
      renderTooltipLoaded(company, ticker, cached);
      positionTooltip(span);
      return;
    }

    renderTooltipLoading(company, ticker);

    const response = await fetchQuote(ticker);
    if (activeSpan !== span) return;

    if (response && response.ok) {
      setCachedQuote(ticker, response.data);
      renderTooltipLoaded(company, ticker, response.data);
    } else {
      renderTooltipError(company, ticker, response?.code || 'NETWORK_ERROR');
    }
    positionTooltip(span);
  }

  // ── Event delegation ───────────────────────────────────────────────────────
  function onMouseOver(e) {
    const span = e.target.closest('.' + HIGHLIGHT_CLASS);
    if (!span || !enabled) return;

    clearTimeout(hoverTimer);
    clearTimeout(hideTimer);

    hoverTimer = setTimeout(() => {
      handleHover(span);
    }, HOVER_DEBOUNCE_MS);
  }

  function onMouseOut(e) {
    const span = e.target.closest('.' + HIGHLIGHT_CLASS);
    if (!span) return;

    const related = e.relatedTarget;
    if (related && (span.contains(related) || tooltipEl?.contains(related))) return;

    clearTimeout(hoverTimer);
    scheduleHide();
  }

  function openBroker(ticker) {
    if (!ticker || ticker === 'null' || !enabled) return;
    const buildUrl = PLATFORM_URLS[platform] || PLATFORM_URLS.yahoo;
    window.open(buildUrl(ticker), '_blank', 'noopener');
  }

  function onClick(e) {
    const span = e.target.closest('.' + HIGHLIGHT_CLASS);
    if (!span || !enabled) return;

    e.preventDefault();
    openBroker(span.dataset.ticker);
  }

  // ── Manual selection lookup ────────────────────────────────────────────────
  function findDictionaryMatches(query) {
    const q = query.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!q) return [];

    if (q in COMPANY_MAP) {
      return [{ name: query.trim(), ticker: COMPANY_MAP[q] }];
    }

    const matches = [];
    for (const key of sortedKeys) {
      if (key === q || key.includes(q) || q.includes(key)) {
        matches.push({ name: key, ticker: COMPANY_MAP[key] });
        if (matches.length >= 6) break;
      }
    }
    return matches;
  }

  function searchSymbol(query) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'SEARCH_SYMBOL', query }, resolve);
    });
  }

  function wrapRangeWithHighlight(range, companyName, ticker) {
    const span = document.createElement('span');
    span.className = HIGHLIGHT_CLASS;
    span.dataset.company = companyName;
    span.dataset.ticker = ticker === null ? 'null' : ticker;

    try {
      range.surroundContents(span);
    } catch {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }
    return span;
  }

  function renderTooltipPicker(query, candidates) {
    const items = candidates.map((c, i) => {
      const label = c.name || c.description || c.symbol;
      const sym = c.ticker ?? c.symbol;
      const traded = sym === null || sym === undefined;
      return `<button type="button" class="pick-item" data-idx="${i}">
        <span class="pick-name">${escapeHtml(label)}</span>
        <span class="pick-ticker">${traded ? 'Private' : escapeHtml(sym)}</span>
      </button>`;
    }).join('');

    tooltipEl.innerHTML = `
      <div class="header">
        <span class="company-name">Look up “${escapeHtml(query)}”</span>
      </div>
      <div class="pick-list">${items}</div>
      <div class="footer">Select a match</div>
    `;

    tooltipEl.querySelectorAll('.pick-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const pick = candidates[idx];
        const ticker = pick.ticker ?? pick.symbol ?? null;
        const name = pick.name || pick.description || query.trim();
        applyManualLookup(name, ticker);
      });
    });
  }

  function applyManualLookup(companyName, ticker) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0).cloneRange();
    sel.removeAllRanges();

    const span = wrapRangeWithHighlight(range, companyName, ticker);
    if (!span) return;

    handleHover(span);
  }

  async function lookupSelectedText(text) {
    if (!enabled) return;

    const query = text.trim();
    if (query.length < 2) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    ensureTooltip();

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    tooltipEl.innerHTML = `<div class="info-msg">Searching for “${escapeHtml(query)}”…</div>`;
    tooltipHost.style.top = '0';
    tooltipHost.style.left = '0';
    tooltipEl.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
    tooltipEl.style.left = (rect.left + window.scrollX) + 'px';
    showTooltip();

    const dictMatches = findDictionaryMatches(query);
    if (dictMatches.length === 1) {
      applyManualLookup(dictMatches[0].name, dictMatches[0].ticker);
      return;
    }
    if (dictMatches.length > 1) {
      renderTooltipPicker(query, dictMatches);
      return;
    }

    const response = await searchSymbol(query);
    if (!response || !response.ok || !response.results?.length) {
      tooltipEl.innerHTML = `
        <div class="header"><span class="company-name">${escapeHtml(query)}</span></div>
        <div class="error-msg">No ticker found. Try a more specific name.</div>
      `;
      return;
    }

    const results = response.results.slice(0, 6);
    if (results.length === 1) {
      applyManualLookup(results[0].description || query, results[0].symbol);
      return;
    }

    renderTooltipPicker(query, results);
  }

  // ── Storage & init ─────────────────────────────────────────────────────────
  function loadSettings() {
    return chrome.storage.sync.get({ enabled: true, platform: 'yahoo' });
  }

  function start() {
    buildPattern();
    initObserver();
    collectContainers(document.body);
    initMutationObserver();

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
  }

  function stop() {
    hideTooltip();
    clearTimeout(hoverTimer);
    clearTimeout(hideTimer);
  }

  let started = false;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (!enabled) {
        stop();
        started = false;
      } else if (!started) {
        start();
        started = true;
      }
    }
    if (changes.platform) {
      platform = changes.platform.newValue || 'yahoo';
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'LOOKUP_SELECTION') {
      lookupSelectedText(message.text || '');
      sendResponse({ ok: true });
    }
    return false;
  });

  loadSettings().then((settings) => {
    enabled = settings.enabled !== false;
    platform = settings.platform || 'yahoo';
    if (!enabled) return;
    start();
    started = true;
  });
})();
