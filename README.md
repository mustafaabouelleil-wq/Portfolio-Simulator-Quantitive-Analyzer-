# QuantTrader — $10000 Live Portfolio Simulator

A real-time quantitative trading dashboard that pulls **live stock prices** from Yahoo Finance and lets you manage a $10000 paper trading portfolio.

## Quick Start

```bash
# 1. Unzip and enter the folder
cd quant-trader

# 2. Install dependencies
npm install

# 3. Start the server
node server.js

# 4. Open in browser
# http://localhost:3000
```

## Features

- **Live market data** — real-time prices from Yahoo Finance, refreshing every 30 seconds
- **Paper trading** — buy/sell fractional shares with your $100 starting cash
- **Portfolio tracking** — live P&L, unrealized gains, cost basis tracking
- **Trade log** — full history of all your trades
- **Persistent state** — your portfolio saves to `portfolio.json` so it survives restarts
- **Market status** — shows whether US markets are currently open or closed

## Stocks Tracked

AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, JPM, JNJ, SPY

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prices` | Live quotes for all tracked stocks |
| GET | `/api/portfolio` | Current portfolio with live valuations |
| POST | `/api/buy` | Buy shares `{ ticker, amount }` |
| POST | `/api/sell` | Sell shares `{ ticker, fraction }` |
| POST | `/api/reset` | Reset portfolio to $100 |

## Tech Stack

- **Backend:** Node.js + Express
- **Data:** yahoo-finance2
- **Frontend:** Vanilla HTML/CSS/JS + Chart.js
- **Storage:** JSON file (portfolio.json)

## Quantitve Model Explanation

Composite Scanner — Enter any tickers and it runs all models simultaneously, ranks them by signal strength, and tells you exactly why. Click any result to deep-dive.

Mean Reversion — Calculates z-scores against 20-day moving averages, Bollinger Band %B position, RSI overbought/oversold levels, and distance from SMA. Flags stocks that have deviated far from their mean.

Momentum — Analyzes SMA crossovers (golden cross / death cross), MACD histogram and signal line, 5-day and 20-day rate of change, RSI momentum zones, and volume surges confirming trends.

ML Pattern Recognition — Builds a feature composite from trend consistency across 6 timeframes, RSI contribution, Bollinger %B mean-reversion component, volume trend analysis, and linear regression to predict 5-day price targets with R² confidence.

Statistical Arbitrage (Pairs) — Scans 16 pre-built correlated pairs (NVDA/AMD, V/MA, KO/PEP, etc.), computing correlation, price ratio z-scores, spread z-scores, and R² from linear regression. When a pair diverges beyond 2 standard deviations, it flags a long/short trade.

Volatility Analysis — Measures 20-day and 60-day historical vol, vol ratio for regime detection (expanding vs compressing), ATR as % of price, and Bollinger squeeze detection for breakout setups.

Backtester — Tests momentum, mean reversion, and combined strategies on historical data, showing total return, alpha vs buy-and-hold, Sharpe ratio, win rate, max drawdown, and number of trades — with a chart.

Risk Analysis — Analyzes your live portfolio for position concentration, sector concentration, cash buffer, diversification, and per-holding volatility.