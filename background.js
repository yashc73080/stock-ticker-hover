const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';
const FINNHUB_SEARCH_URL = 'https://finnhub.io/api/v1/search';
const LOOKUP_MENU_ID = 'htt-lookup-selection';

function sendLookupToTab(tabId, text) {
  if (!tabId || !text?.trim()) return;
  chrome.tabs.sendMessage(tabId, { type: 'LOOKUP_SELECTION', text: text.trim() }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: LOOKUP_MENU_ID,
      title: 'Look up stock ticker',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== LOOKUP_MENU_ID) return;
  sendLookupToTab(tab?.id, info.selectionText);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'lookup-selection') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || '',
    }).then((results) => {
      const text = results?.[0]?.result;
      sendLookupToTab(tab.id, text);
    }).catch(() => {});
  });
});

function isInvalidSymbol(data) {
  return (
    data.c === 0 &&
    data.d === 0 &&
    data.dp === 0 &&
    data.h === 0 &&
    data.l === 0 &&
    data.pc === 0
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SEARCH_SYMBOL') {
    (async () => {
      try {
        const { apiKey } = await chrome.storage.sync.get('apiKey');
        if (!apiKey) {
          sendResponse({ ok: false, code: 'NO_API_KEY' });
          return;
        }

        const url = `${FINNHUB_SEARCH_URL}?q=${encodeURIComponent(message.query)}&token=${encodeURIComponent(apiKey)}`;
        let response;
        try {
          response = await fetch(url);
        } catch {
          sendResponse({ ok: false, code: 'NETWORK_ERROR' });
          return;
        }

        if (!response.ok) {
          sendResponse({ ok: false, code: 'NETWORK_ERROR' });
          return;
        }

        const data = await response.json();
        const results = (data.result || [])
          .filter((r) => r.type === 'Common Stock' || r.type === 'EQS')
          .slice(0, 8)
          .map((r) => ({
            symbol: r.symbol,
            description: r.description,
            displaySymbol: r.displaySymbol,
          }));

        sendResponse({ ok: true, results });
      } catch {
        sendResponse({ ok: false, code: 'NETWORK_ERROR' });
      }
    })();
    return true;
  }

  if (message.type !== 'FETCH_QUOTE') {
    return false;
  }

  (async () => {
    try {
      const { apiKey } = await chrome.storage.sync.get('apiKey');
      if (!apiKey) {
        sendResponse({ ok: false, code: 'NO_API_KEY' });
        return;
      }

      const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(message.ticker)}&token=${encodeURIComponent(apiKey)}`;
      let response;
      try {
        response = await fetch(url);
      } catch {
        sendResponse({ ok: false, code: 'NETWORK_ERROR' });
        return;
      }

      if (response.status === 429) {
        sendResponse({ ok: false, code: 'RATE_LIMIT' });
        return;
      }

      if (response.status === 403) {
        sendResponse({ ok: false, code: 'INVALID_KEY' });
        return;
      }

      if (!response.ok) {
        sendResponse({ ok: false, code: 'NETWORK_ERROR' });
        return;
      }

      const data = await response.json();

      if (isInvalidSymbol(data)) {
        sendResponse({ ok: false, code: 'INVALID_SYMBOL' });
        return;
      }

      sendResponse({
        ok: true,
        data: {
          price: data.c,
          change: data.d,
          changePercent: data.dp,
          high: data.h,
          low: data.l,
          previousClose: data.pc,
        },
      });
    } catch {
      sendResponse({ ok: false, code: 'NETWORK_ERROR' });
    }
  })();

  return true;
});
