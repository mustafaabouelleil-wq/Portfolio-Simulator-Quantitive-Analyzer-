// ══════════════════════════════════════════════════════════════════
//  QUANT ENGINE — Mathematical Trading Models
//  Statistical Arbitrage | Mean Reversion | Momentum | ML/Pattern
//  Volatility | Risk Management | Backtesting
// ══════════════════════════════════════════════════════════════════

class QuantEngine {
  constructor() {
    this.historicalCache = {};   // ticker -> { dates, closes, volumes, highs, lows }
    this.pairCorrelations = {};  // "AAPL:MSFT" -> correlation
    this.signals = {};           // ticker -> { model, signal, strength, meta }
    this.backtestResults = {};
  }

  // ── DATA HELPERS ─────────────────────────────────────────────

  /**
   * Store historical data for a ticker
   */
  setHistory(ticker, data) {
    this.historicalCache[ticker] = data;
  }

  getHistory(ticker) {
    return this.historicalCache[ticker] || null;
  }

  // ── STATISTICAL FUNCTIONS ────────────────────────────────────

  mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  std(arr) {
    const m = this.mean(arr);
    const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  zscore(value, arr) {
    const m = this.mean(arr);
    const s = this.std(arr);
    if (s === 0) return 0;
    return (value - m) / s;
  }

  correlation(arrA, arrB) {
    const n = Math.min(arrA.length, arrB.length);
    if (n < 5) return 0;
    const a = arrA.slice(-n), b = arrB.slice(-n);
    const mA = this.mean(a), mB = this.mean(b);
    const sA = this.std(a), sB = this.std(b);
    if (sA === 0 || sB === 0) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += (a[i] - mA) * (b[i] - mB);
    return sum / (n * sA * sB);
  }

  linearRegression(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { slope: 0, intercept: 0, r2: 0 };
    const mx = this.mean(x.slice(-n)), my = this.mean(y.slice(-n));
    let num = 0, den = 0, ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      den += (x[i] - mx) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = my - slope * mx;
    for (let i = 0; i < n; i++) {
      const pred = slope * x[i] + intercept;
      ssRes += (y[i] - pred) ** 2;
      ssTot += (y[i] - my) ** 2;
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    return { slope, intercept, r2 };
  }

  // ── TECHNICAL INDICATORS ─────────────────────────────────────

  sma(closes, period) {
    if (closes.length < period) return null;
    return this.mean(closes.slice(-period));
  }

  ema(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = this.mean(closes.slice(0, period));
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  }

  rsi(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  macd(closes) {
    const ema12 = this.ema(closes, 12);
    const ema26 = this.ema(closes, 26);
    if (ema12 === null || ema26 === null) return null;
    const macdLine = ema12 - ema26;
    // Approximate signal line (9-period EMA of MACD)
    // We'll compute full MACD series for signal
    if (closes.length < 35) return { macd: macdLine, signal: 0, histogram: macdLine };
    const macdSeries = [];
    for (let i = 26; i <= closes.length; i++) {
      const e12 = this.ema(closes.slice(0, i), 12);
      const e26 = this.ema(closes.slice(0, i), 26);
      if (e12 !== null && e26 !== null) macdSeries.push(e12 - e26);
    }
    const signalLine = macdSeries.length >= 9 ? this.ema(macdSeries, 9) : 0;
    return { macd: macdLine, signal: signalLine || 0, histogram: macdLine - (signalLine || 0) };
  }

  bollingerBands(closes, period = 20, mult = 2) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const mid = this.mean(slice);
    const s = this.std(slice);
    return { upper: mid + mult * s, middle: mid, lower: mid - mult * s, bandwidth: (4 * mult * s) / mid };
  }

  atr(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return null;
    const trs = [];
    for (let i = closes.length - period; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trs.push(tr);
    }
    return this.mean(trs);
  }

  // ══════════════════════════════════════════════════════════════
  //  MODEL 1: MEAN REVERSION
  // ══════════════════════════════════════════════════════════════

  meanReversionSignal(ticker) {
    const data = this.getHistory(ticker);
    if (!data || data.closes.length < 30) return null;

    const closes = data.closes;
    const current = closes[closes.length - 1];
    const sma20 = this.sma(closes, 20);
    const sma50 = this.sma(closes, 50);
    const bb = this.bollingerBands(closes, 20, 2);
    const rsiVal = this.rsi(closes, 14);
    const zScore = this.zscore(current, closes.slice(-20));

    let score = 0; // -100 to +100, negative = sell, positive = buy
    let reasons = [];

    // Z-score signal
    if (zScore < -2) { score += 35; reasons.push(`Z-score ${zScore.toFixed(2)} — deeply oversold`); }
    else if (zScore < -1.5) { score += 25; reasons.push(`Z-score ${zScore.toFixed(2)} — oversold`); }
    else if (zScore > 2) { score -= 35; reasons.push(`Z-score ${zScore.toFixed(2)} — deeply overbought`); }
    else if (zScore > 1.5) { score -= 25; reasons.push(`Z-score ${zScore.toFixed(2)} — overbought`); }

    // Bollinger Band signal
    if (bb) {
      if (current < bb.lower) { score += 25; reasons.push("Price below lower Bollinger Band"); }
      else if (current > bb.upper) { score -= 25; reasons.push("Price above upper Bollinger Band"); }
      const pctB = (current - bb.lower) / (bb.upper - bb.lower);
      if (pctB < 0.1) { score += 10; reasons.push(`%B = ${(pctB * 100).toFixed(1)}% — extreme low`); }
      if (pctB > 0.9) { score -= 10; reasons.push(`%B = ${(pctB * 100).toFixed(1)}% — extreme high`); }
    }

    // RSI signal
    if (rsiVal !== null) {
      if (rsiVal < 30) { score += 20; reasons.push(`RSI ${rsiVal.toFixed(1)} — oversold`); }
      else if (rsiVal < 40) { score += 10; reasons.push(`RSI ${rsiVal.toFixed(1)} — approaching oversold`); }
      else if (rsiVal > 70) { score -= 20; reasons.push(`RSI ${rsiVal.toFixed(1)} — overbought`); }
      else if (rsiVal > 60) { score -= 10; reasons.push(`RSI ${rsiVal.toFixed(1)} — approaching overbought`); }
    }

    // Distance from SMA
    if (sma20) {
      const distPct = ((current - sma20) / sma20) * 100;
      if (distPct < -5) { score += 10; reasons.push(`${distPct.toFixed(1)}% below SMA20`); }
      if (distPct > 5) { score -= 10; reasons.push(`${distPct.toFixed(1)}% above SMA20`); }
    }

    const signal = score > 20 ? "BUY" : score < -20 ? "SELL" : "HOLD";
    const strength = Math.min(Math.abs(score) / 100, 1);

    return {
      model: "Mean Reversion",
      ticker,
      signal,
      score,
      strength,
      reasons,
      indicators: {
        zScore: +zScore.toFixed(2),
        rsi: rsiVal ? +rsiVal.toFixed(1) : null,
        sma20, sma50,
        bollingerUpper: bb?.upper, bollingerLower: bb?.lower,
        currentPrice: current,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  MODEL 2: MOMENTUM TRADING
  // ══════════════════════════════════════════════════════════════

  momentumSignal(ticker) {
    const data = this.getHistory(ticker);
    if (!data || data.closes.length < 50) return null;

    const closes = data.closes;
    const volumes = data.volumes || [];
    const current = closes[closes.length - 1];
    const macdResult = this.macd(closes);
    const rsiVal = this.rsi(closes, 14);
    const sma10 = this.sma(closes, 10);
    const sma20 = this.sma(closes, 20);
    const sma50 = this.sma(closes, 50);

    // Rate of change (ROC)
    const roc5 = closes.length >= 6 ? ((current - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
    const roc20 = closes.length >= 21 ? ((current - closes[closes.length - 21]) / closes[closes.length - 21]) * 100 : 0;

    let score = 0;
    let reasons = [];

    // Trend direction — SMA crossovers
    if (sma10 && sma20 && sma10 > sma20) { score += 15; reasons.push("SMA10 > SMA20 — short-term uptrend"); }
    else if (sma10 && sma20 && sma10 < sma20) { score -= 15; reasons.push("SMA10 < SMA20 — short-term downtrend"); }

    if (sma20 && sma50) {
      if (sma20 > sma50) { score += 15; reasons.push("SMA20 > SMA50 — golden cross territory"); }
      else { score -= 15; reasons.push("SMA20 < SMA50 — death cross territory"); }
    }

    // MACD
    if (macdResult) {
      if (macdResult.histogram > 0) { score += 15; reasons.push(`MACD histogram positive (${macdResult.histogram.toFixed(3)})`); }
      else { score -= 15; reasons.push(`MACD histogram negative (${macdResult.histogram.toFixed(3)})`); }
      if (macdResult.macd > macdResult.signal) { score += 10; reasons.push("MACD above signal line"); }
      else { score -= 10; reasons.push("MACD below signal line"); }
    }

    // Rate of change
    if (roc5 > 3) { score += 15; reasons.push(`5-day ROC +${roc5.toFixed(1)}% — strong short momentum`); }
    else if (roc5 < -3) { score -= 15; reasons.push(`5-day ROC ${roc5.toFixed(1)}% — weak short momentum`); }

    if (roc20 > 8) { score += 15; reasons.push(`20-day ROC +${roc20.toFixed(1)}% — strong medium momentum`); }
    else if (roc20 < -8) { score -= 15; reasons.push(`20-day ROC ${roc20.toFixed(1)}% — weak medium momentum`); }

    // RSI momentum confirmation
    if (rsiVal !== null) {
      if (rsiVal > 50 && rsiVal < 70) { score += 10; reasons.push(`RSI ${rsiVal.toFixed(1)} — bullish momentum zone`); }
      else if (rsiVal < 50 && rsiVal > 30) { score -= 10; reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish momentum zone`); }
    }

    // Volume surge (if available)
    if (volumes.length >= 20) {
      const avgVol = this.mean(volumes.slice(-20));
      const recentVol = volumes[volumes.length - 1];
      if (avgVol > 0 && recentVol > avgVol * 1.5) {
        const volMult = (recentVol / avgVol).toFixed(1);
        if (roc5 > 0) { score += 10; reasons.push(`Volume surge ${volMult}x avg — confirms uptrend`); }
        else { score -= 10; reasons.push(`Volume surge ${volMult}x avg — confirms downtrend`); }
      }
    }

    const signal = score > 20 ? "BUY" : score < -20 ? "SELL" : "HOLD";
    const strength = Math.min(Math.abs(score) / 100, 1);

    return {
      model: "Momentum",
      ticker,
      signal,
      score,
      strength,
      reasons,
      indicators: {
        roc5: +roc5.toFixed(2),
        roc20: +roc20.toFixed(2),
        rsi: rsiVal ? +rsiVal.toFixed(1) : null,
        macd: macdResult,
        sma10, sma20, sma50,
        currentPrice: current,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  MODEL 3: STATISTICAL ARBITRAGE (Pairs Trading)
  // ══════════════════════════════════════════════════════════════

  statArbSignal(tickerA, tickerB) {
    const dataA = this.getHistory(tickerA);
    const dataB = this.getHistory(tickerB);
    if (!dataA || !dataB) return null;

    const n = Math.min(dataA.closes.length, dataB.closes.length);
    if (n < 30) return null;

    const closesA = dataA.closes.slice(-n);
    const closesB = dataB.closes.slice(-n);

    // Compute correlation
    const corr = this.correlation(closesA, closesB);

    // Compute price ratio
    const ratios = closesA.map((a, i) => a / closesB[i]);
    const currentRatio = ratios[ratios.length - 1];
    const ratioZScore = this.zscore(currentRatio, ratios.slice(-20));

    // Spread (log returns difference)
    const returnsA = closesA.slice(1).map((v, i) => Math.log(v / closesA[i]));
    const returnsB = closesB.slice(1).map((v, i) => Math.log(v / closesB[i]));
    const spread = returnsA.map((a, i) => a - (returnsB[i] || 0));
    const spreadZScore = this.zscore(spread[spread.length - 1] || 0, spread.slice(-20));

    // Cointegration approximation (linear regression)
    const reg = this.linearRegression(closesB, closesA);

    let score = 0;
    let reasons = [];
    let tradeAction = null; // { long, short }

    if (Math.abs(corr) < 0.5) {
      return {
        model: "Stat Arb",
        pair: `${tickerA}/${tickerB}`,
        signal: "NO_PAIR",
        score: 0,
        strength: 0,
        reasons: [`Correlation ${corr.toFixed(2)} too low — not a valid pair`],
        indicators: { correlation: +corr.toFixed(3), ratioZScore: +ratioZScore.toFixed(2), r2: +reg.r2.toFixed(3) },
      };
    }

    // Z-score divergence signals
    if (ratioZScore > 2) {
      score = 30 + Math.min((ratioZScore - 2) * 15, 40);
      tradeAction = { long: tickerB, short: tickerA };
      reasons.push(`Ratio z-score ${ratioZScore.toFixed(2)} — ${tickerA} overpriced vs ${tickerB}`);
      reasons.push(`Action: Long ${tickerB}, Short ${tickerA}`);
    } else if (ratioZScore < -2) {
      score = 30 + Math.min((Math.abs(ratioZScore) - 2) * 15, 40);
      tradeAction = { long: tickerA, short: tickerB };
      reasons.push(`Ratio z-score ${ratioZScore.toFixed(2)} — ${tickerB} overpriced vs ${tickerA}`);
      reasons.push(`Action: Long ${tickerA}, Short ${tickerB}`);
    } else if (Math.abs(ratioZScore) > 1.5) {
      score = 15;
      reasons.push(`Ratio z-score ${ratioZScore.toFixed(2)} — slight divergence, monitoring`);
    }

    if (corr > 0.8) { reasons.push(`Strong correlation ${corr.toFixed(2)}`); score += 5; }
    if (reg.r2 > 0.7) { reasons.push(`High R² ${reg.r2.toFixed(2)} — good linear fit`); score += 5; }

    const signal = score > 20 ? "TRADE" : "HOLD";

    return {
      model: "Stat Arb",
      pair: `${tickerA}/${tickerB}`,
      signal,
      score,
      strength: Math.min(score / 80, 1),
      tradeAction,
      reasons,
      indicators: {
        correlation: +corr.toFixed(3),
        ratioZScore: +ratioZScore.toFixed(2),
        spreadZScore: +spreadZScore.toFixed(2),
        r2: +reg.r2.toFixed(3),
        currentRatio: +currentRatio.toFixed(4),
        meanRatio: +this.mean(ratios.slice(-20)).toFixed(4),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  MODEL 4: VOLATILITY MODEL
  // ══════════════════════════════════════════════════════════════

  volatilitySignal(ticker) {
    const data = this.getHistory(ticker);
    if (!data || data.closes.length < 30) return null;

    const closes = data.closes;
    const highs = data.highs || closes;
    const lows = data.lows || closes;
    const current = closes[closes.length - 1];

    // Historical volatility (annualized)
    const returns = closes.slice(1).map((v, i) => Math.log(v / closes[i]));
    const recentReturns = returns.slice(-20);
    const histVol = this.std(recentReturns) * Math.sqrt(252) * 100;
    const longerVol = returns.length >= 60 ? this.std(returns.slice(-60)) * Math.sqrt(252) * 100 : histVol;

    // ATR
    const atrVal = this.atr(highs, lows, closes, 14);
    const atrPct = atrVal ? (atrVal / current) * 100 : 0;

    // Bollinger bandwidth
    const bb = this.bollingerBands(closes, 20, 2);
    const bandwidth = bb ? bb.bandwidth * 100 : 0;

    // Volatility regime detection
    const volRatio = longerVol > 0 ? histVol / longerVol : 1;

    let score = 0;
    let reasons = [];
    let regime = "NORMAL";

    if (volRatio > 1.5) {
      regime = "HIGH_VOL";
      score -= 20;
      reasons.push(`Vol ratio ${volRatio.toFixed(2)} — volatility expanding rapidly`);
      reasons.push("Consider reducing position sizes or hedging");
    } else if (volRatio < 0.6) {
      regime = "LOW_VOL";
      score += 15;
      reasons.push(`Vol ratio ${volRatio.toFixed(2)} — volatility compressing`);
      reasons.push("Potential breakout setup — watch for direction");
    }

    if (bandwidth < 3) {
      reasons.push(`Bollinger squeeze (bandwidth ${bandwidth.toFixed(1)}%) — big move imminent`);
      regime = "SQUEEZE";
      score += 10;
    } else if (bandwidth > 15) {
      reasons.push(`Bollinger expansion (bandwidth ${bandwidth.toFixed(1)}%) — high volatility`);
    }

    if (histVol > 50) {
      reasons.push(`Historical vol ${histVol.toFixed(1)}% — extremely volatile`);
      score -= 15;
    } else if (histVol < 15) {
      reasons.push(`Historical vol ${histVol.toFixed(1)}% — calm market`);
      score += 5;
    }

    reasons.push(`ATR: $${atrVal?.toFixed(2) || '—'} (${atrPct.toFixed(1)}% of price)`);

    return {
      model: "Volatility",
      ticker,
      signal: regime,
      score,
      strength: Math.min(Math.abs(score) / 60, 1),
      reasons,
      indicators: {
        histVol20: +histVol.toFixed(1),
        histVol60: +longerVol.toFixed(1),
        volRatio: +volRatio.toFixed(2),
        atr: atrVal ? +atrVal.toFixed(2) : null,
        atrPct: +atrPct.toFixed(1),
        bollingerBandwidth: +bandwidth.toFixed(1),
        currentPrice: current,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  MODEL 5: ML / PATTERN RECOGNITION (Simple)
  // ══════════════════════════════════════════════════════════════

  mlSignal(ticker) {
    const data = this.getHistory(ticker);
    if (!data || data.closes.length < 60) return null;

    const closes = data.closes;
    const volumes = data.volumes || [];
    const current = closes[closes.length - 1];

    // Feature engineering
    const returns5 = ((current - closes[closes.length - 6]) / closes[closes.length - 6]);
    const returns10 = closes.length >= 11 ? ((current - closes[closes.length - 11]) / closes[closes.length - 11]) : 0;
    const returns20 = closes.length >= 21 ? ((current - closes[closes.length - 21]) / closes[closes.length - 21]) : 0;
    const rsiVal = this.rsi(closes, 14) || 50;
    const bb = this.bollingerBands(closes, 20, 2);
    const pctB = bb ? (current - bb.lower) / (bb.upper - bb.lower) : 0.5;

    // Trend consistency score
    const periods = [5, 10, 20, 30, 40, 50];
    let trendScore = 0;
    for (const p of periods) {
      if (closes.length > p) {
        const pastPrice = closes[closes.length - 1 - p];
        trendScore += current > pastPrice ? 1 : -1;
      }
    }
    trendScore /= periods.length;

    // Volume trend
    let volTrend = 0;
    if (volumes.length >= 20) {
      const recentAvgVol = this.mean(volumes.slice(-5));
      const olderAvgVol = this.mean(volumes.slice(-20, -5));
      volTrend = olderAvgVol > 0 ? (recentAvgVol - olderAvgVol) / olderAvgVol : 0;
    }

    // Price pattern detection
    const last10 = closes.slice(-10);
    const higherHighs = last10.slice(1).filter((v, i) => v > last10[i]).length;
    const lowerLows = last10.slice(1).filter((v, i) => v < last10[i]).length;

    // Composite ML Score (weighted feature combination)
    let composite = 0;
    composite += trendScore * 25;                                    // Trend consistency
    composite += (rsiVal > 50 ? 1 : -1) * Math.abs(rsiVal - 50) * 0.3; // RSI contribution
    composite += (pctB - 0.5) * -20;                                 // Mean reversion component
    composite += returns20 * 80;                                     // Medium-term momentum
    composite += volTrend > 0.3 ? (trendScore > 0 ? 10 : -10) : 0;  // Volume confirmation

    let reasons = [];
    const classification = composite > 15 ? "BULLISH" : composite < -15 ? "BEARISH" : "NEUTRAL";

    reasons.push(`Trend consistency: ${(trendScore * 100).toFixed(0)}% (${trendScore > 0 ? 'bullish' : 'bearish'} across timeframes)`);
    reasons.push(`Feature composite score: ${composite.toFixed(1)}`);
    reasons.push(`Pattern: ${higherHighs}/9 higher closes, ${lowerLows}/9 lower closes`);
    if (Math.abs(volTrend) > 0.2) reasons.push(`Volume trend: ${volTrend > 0 ? '+' : ''}${(volTrend * 100).toFixed(0)}% vs average`);

    // Regression prediction
    const xVals = Array.from({ length: 20 }, (_, i) => i);
    const yVals = closes.slice(-20);
    const reg = this.linearRegression(xVals, yVals);
    const predicted5Day = reg.slope * 24 + reg.intercept;
    const predictedReturn = ((predicted5Day - current) / current) * 100;
    reasons.push(`Linear regression R²: ${reg.r2.toFixed(2)}, 5-day predicted: $${predicted5Day.toFixed(2)} (${predictedReturn >= 0 ? '+' : ''}${predictedReturn.toFixed(1)}%)`);

    const signal = classification === "BULLISH" ? "BUY" : classification === "BEARISH" ? "SELL" : "HOLD";

    return {
      model: "ML Pattern",
      ticker,
      signal,
      classification,
      score: +composite.toFixed(1),
      strength: Math.min(Math.abs(composite) / 60, 1),
      reasons,
      indicators: {
        trendScore: +trendScore.toFixed(2),
        compositeScore: +composite.toFixed(1),
        rsi: +rsiVal.toFixed(1),
        pctB: +pctB.toFixed(2),
        returns5: +(returns5 * 100).toFixed(2),
        returns20: +(returns20 * 100).toFixed(2),
        volTrend: +(volTrend * 100).toFixed(1),
        regressionR2: +reg.r2.toFixed(3),
        predictedPrice: +predicted5Day.toFixed(2),
        predictedReturn: +predictedReturn.toFixed(2),
        currentPrice: current,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  COMPOSITE SIGNAL — Combine All Models
  // ══════════════════════════════════════════════════════════════

  compositeSignal(ticker) {
    const mr = this.meanReversionSignal(ticker);
    const mom = this.momentumSignal(ticker);
    const vol = this.volatilitySignal(ticker);
    const ml = this.mlSignal(ticker);

    const models = [mr, mom, ml].filter(Boolean);
    if (!models.length) return null;

    // Weighted composite
    const weights = { "Mean Reversion": 0.3, "Momentum": 0.35, "ML Pattern": 0.35 };
    let weightedScore = 0;
    let totalWeight = 0;

    for (const m of models) {
      const w = weights[m.model] || 0.33;
      weightedScore += m.score * w;
      totalWeight += w;
    }

    if (totalWeight > 0) weightedScore /= totalWeight;

    // If models agree, boost confidence
    const signals = models.map(m => m.signal);
    const allBuy = signals.every(s => s === "BUY" || s === "BULLISH");
    const allSell = signals.every(s => s === "SELL" || s === "BEARISH");
    let agreement = "MIXED";
    if (allBuy) { agreement = "CONSENSUS_BUY"; weightedScore *= 1.3; }
    if (allSell) { agreement = "CONSENSUS_SELL"; weightedScore *= 1.3; }

    // Volatility adjustment — reduce confidence in high-vol regimes
    if (vol && vol.signal === "HIGH_VOL") {
      weightedScore *= 0.7;
    }

    const finalSignal = weightedScore > 15 ? "STRONG_BUY" :
                        weightedScore > 8 ? "BUY" :
                        weightedScore < -15 ? "STRONG_SELL" :
                        weightedScore < -8 ? "SELL" : "HOLD";

    return {
      ticker,
      signal: finalSignal,
      score: +weightedScore.toFixed(1),
      strength: Math.min(Math.abs(weightedScore) / 50, 1),
      agreement,
      models: { meanReversion: mr, momentum: mom, volatility: vol, ml },
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  BACKTESTER
  // ══════════════════════════════════════════════════════════════

  backtest(ticker, strategy = "momentum", params = {}) {
    const data = this.getHistory(ticker);
    if (!data || data.closes.length < 60) return null;

    const closes = data.closes;
    const startCash = params.startCash || 10000;
    const lookback = params.lookback || 20;
    const threshold = params.threshold || 15;

    let cash = startCash;
    let shares = 0;
    let trades = [];
    let portfolioValues = [startCash];
    let maxValue = startCash;
    let maxDrawdown = 0;

    for (let i = 50; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      let signal = null;

      // Generate signal based on strategy
      if (strategy === "momentum") {
        const roc = ((slice[i] - slice[i - lookback]) / slice[i - lookback]) * 100;
        const rsiVal = this.rsi(slice, 14);
        if (roc > threshold / 3 && rsiVal && rsiVal < 70) signal = "BUY";
        else if (roc < -threshold / 3 && rsiVal && rsiVal > 30) signal = "SELL";
      } else if (strategy === "meanReversion") {
        const zScore = this.zscore(slice[i], slice.slice(-lookback));
        if (zScore < -1.5) signal = "BUY";
        else if (zScore > 1.5) signal = "SELL";
      } else if (strategy === "combined") {
        const roc = ((slice[i] - slice[i - lookback]) / slice[i - lookback]) * 100;
        const zScore = this.zscore(slice[i], slice.slice(-lookback));
        const rsiVal = this.rsi(slice, 14) || 50;
        const momScore = roc > 3 ? 1 : roc < -3 ? -1 : 0;
        const mrScore = zScore < -1.5 ? 1 : zScore > 1.5 ? -1 : 0;
        const rsiScore = rsiVal < 35 ? 1 : rsiVal > 65 ? -1 : 0;
        const total = momScore + mrScore + rsiScore;
        if (total >= 2) signal = "BUY";
        else if (total <= -2) signal = "SELL";
      }

      // Execute
      if (signal === "BUY" && cash > 0 && shares === 0) {
        shares = cash / slice[i];
        trades.push({ day: i, action: "BUY", price: slice[i], shares });
        cash = 0;
      } else if (signal === "SELL" && shares > 0) {
        cash = shares * slice[i];
        trades.push({ day: i, action: "SELL", price: slice[i], shares, pnl: cash - startCash });
        shares = 0;
      }

      const value = cash + shares * slice[i];
      portfolioValues.push(value);
      if (value > maxValue) maxValue = value;
      const dd = (maxValue - value) / maxValue;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Close final position
    const finalValue = cash + shares * closes[closes.length - 1];
    const totalReturn = ((finalValue - startCash) / startCash) * 100;
    const buyHoldReturn = ((closes[closes.length - 1] - closes[50]) / closes[50]) * 100;
    const numTrades = trades.length;
    const winTrades = trades.filter(t => t.action === "SELL" && t.pnl > 0).length;
    const loseTrades = trades.filter(t => t.action === "SELL" && t.pnl <= 0).length;

    // Sharpe ratio
    const dailyReturns = portfolioValues.slice(1).map((v, i) => (v - portfolioValues[i]) / portfolioValues[i]);
    const avgReturn = this.mean(dailyReturns);
    const stdReturn = this.std(dailyReturns);
    const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    return {
      ticker,
      strategy,
      startCash,
      finalValue: +finalValue.toFixed(2),
      totalReturn: +totalReturn.toFixed(2),
      buyHoldReturn: +buyHoldReturn.toFixed(2),
      alpha: +(totalReturn - buyHoldReturn).toFixed(2),
      numTrades,
      winRate: numTrades > 0 ? +((winTrades / Math.max(winTrades + loseTrades, 1)) * 100).toFixed(1) : 0,
      maxDrawdown: +(maxDrawdown * 100).toFixed(1),
      sharpe: +sharpe.toFixed(2),
      trades: trades.slice(-20), // last 20 trades
      portfolioValues,
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  RISK MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  riskAnalysis(portfolio, prices) {
    const positions = Object.entries(portfolio.holdings || {});
    if (!positions.length) return { riskLevel: "NONE", score: 0, warnings: [], metrics: {} };

    const totalValue = portfolio.cash + positions.reduce((sum, [tk, h]) => {
      return sum + h.shares * (prices[tk]?.price || 0);
    }, 0);

    let warnings = [];
    let riskScore = 0;

    // Position concentration
    const positionWeights = {};
    const sectorWeights = {};
    for (const [tk, h] of positions) {
      const val = h.shares * (prices[tk]?.price || 0);
      const weight = totalValue > 0 ? (val / totalValue) * 100 : 0;
      positionWeights[tk] = +weight.toFixed(1);
      const sector = prices[tk]?.sector || "Other";
      sectorWeights[sector] = (sectorWeights[sector] || 0) + weight;
    }

    // Check concentration
    const maxWeight = Math.max(...Object.values(positionWeights));
    if (maxWeight > 40) {
      riskScore += 30;
      const topTicker = Object.entries(positionWeights).sort((a, b) => b[1] - a[1])[0][0];
      warnings.push(`HIGH: ${topTicker} is ${maxWeight.toFixed(1)}% of portfolio — extreme concentration risk`);
    } else if (maxWeight > 25) {
      riskScore += 15;
      warnings.push(`MEDIUM: Top position is ${maxWeight.toFixed(1)}% — consider diversifying`);
    }

    // Sector concentration
    const maxSectorWeight = Math.max(...Object.values(sectorWeights));
    if (maxSectorWeight > 60) {
      riskScore += 20;
      const topSec = Object.entries(sectorWeights).sort((a, b) => b[1] - a[1])[0][0];
      warnings.push(`HIGH: ${topSec} sector is ${maxSectorWeight.toFixed(1)}% — sector concentration risk`);
    }

    // Cash ratio
    const cashPct = totalValue > 0 ? (portfolio.cash / totalValue) * 100 : 100;
    if (cashPct < 5) {
      riskScore += 15;
      warnings.push(`LOW CASH: Only ${cashPct.toFixed(1)}% cash — no buffer for opportunities or drawdowns`);
    } else if (cashPct > 80) {
      warnings.push(`HIGH CASH: ${cashPct.toFixed(1)}% in cash — capital not deployed`);
    }

    // Number of positions
    if (positions.length === 1) {
      riskScore += 15;
      warnings.push("SINGLE POSITION: No diversification — extremely risky");
    } else if (positions.length >= 15) {
      warnings.push(`${positions.length} positions — well diversified`);
      riskScore -= 10;
    }

    // Volatility check for each holding
    let portfolioVol = 0;
    let volChecks = 0;
    for (const [tk] of positions) {
      const volSig = this.volatilitySignal(tk);
      if (volSig && volSig.indicators.histVol20) {
        const w = (positionWeights[tk] || 0) / 100;
        portfolioVol += volSig.indicators.histVol20 * w;
        volChecks++;
        if (volSig.indicators.histVol20 > 60) {
          riskScore += 5;
          warnings.push(`${tk} has ${volSig.indicators.histVol20.toFixed(0)}% annualized volatility`);
        }
      }
    }

    const riskLevel = riskScore > 40 ? "HIGH" : riskScore > 20 ? "MEDIUM" : riskScore > 0 ? "LOW" : "MINIMAL";

    return {
      riskLevel,
      riskScore: Math.max(0, Math.min(100, riskScore)),
      warnings,
      metrics: {
        totalValue: +totalValue.toFixed(2),
        cashPct: +cashPct.toFixed(1),
        numPositions: positions.length,
        maxPositionWeight: +maxWeight.toFixed(1),
        maxSectorWeight: +maxSectorWeight.toFixed(1),
        positionWeights,
        sectorWeights: Object.fromEntries(Object.entries(sectorWeights).map(([k, v]) => [k, +v.toFixed(1)])),
        estimatedPortfolioVol: volChecks > 0 ? +portfolioVol.toFixed(1) : null,
      },
    };
  }
}

module.exports = QuantEngine;
