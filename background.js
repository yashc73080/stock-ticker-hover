const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';

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
