# Glance

A Chrome extension (Manifest V3) that scans webpages for company names, highlights them with a subtle underline, and shows real-time stock data on hover via the Finnhub API.

## Setup

1. Open `chrome://extensions` and enable **Developer mode**
2. Click **Load unpacked** and select this directory
3. Click the extension icon → add your free [Finnhub API key](https://finnhub.io/register)
4. Browse any news or finance site — company names highlight as you scroll

## Features

- Viewport-scoped scanning (IntersectionObserver) — no NLP until content is near the viewport
- Three-layer entity recognition: dictionary → compromise.js NLP → context scoring
- Real-time quotes on hover with 30-second in-memory cache
- Click a highlighted name to open your preferred platform (Yahoo, Robinhood, TradingView, CNBC, MarketWatch)
- Toggle the extension on/off from the popup without reloading pages

## Project Structure

```
manifest.json       Extension manifest (MV3)
background.js       Service worker — Finnhub API proxy
content.js          Scanner, tooltip, hover/click handling
companies.js        Company name → ticker dictionary (S&P 500 + alternates)
styles.css          Host-page highlight styles
vendor/             compromise.min.js NLP library
popup/              Settings UI (API key, platform, enable toggle)
icons/              Extension icons
scripts/            Dev utilities (generate-companies.js, validate-map.js)
```

## Regenerating companies.js

S&P 500 only (default):

```bash
node scripts/generate-companies.js
```

Include all NASDAQ/NYSE listed symbols (~6,000+ companies):

```bash
node scripts/generate-companies.js --fetch-symbols
```

This downloads public symbol lists from nasdaqtrader.com and merges them with the S&P 500 data and brand aliases. Requires network access during generation only — the extension itself stays offline.

Single-word brand names (Apple, Dell, Nvidia, etc.) are kept as explicit **trusted brands** with lighter matching rules. Common English words (Best, Live, On, PM) are blocklisted and never matched alone.
