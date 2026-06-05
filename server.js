const express = require("express");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const path = require("path");
const fs = require("fs");
const QuantEngine = require("./quant-engine");

const app = express();
app.use(express.json());

const quant = new QuantEngine();
app.use(express.static(path.join(__dirname, "public")));

// ── Portfolio State ──────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, "portfolio.json");
const CHART_FILE = path.join(__dirname, "chart-history.json");
const DEFAULT_STATE = {
  cash: 10000, holdings: {}, tradeLog: [], startValue: 10000,
  createdAt: new Date().toISOString(),
};

function loadState() {
  try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch (e) { console.error("State load error:", e.message); }
  return { ...DEFAULT_STATE };
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
let portfolio = loadState();

// ── Chart History (persisted) ────────────────────────────────────
function loadChartHistory() {
  try {
    if (fs.existsSync(CHART_FILE)) {
      return JSON.parse(fs.readFileSync(CHART_FILE, "utf8"));
    }
  } catch (e) { console.error("Chart history load error:", e.message); }
  return [];
}

function saveChartHistory(data) {
  // Keep max 43200 data points (~30 days at 1min intervals)
  const trimmed = data.slice(-43200);
  fs.writeFileSync(CHART_FILE, JSON.stringify(trimmed));
}

let chartHistory = loadChartHistory();

// Snapshot portfolio value periodically
function snapshotPortfolioValue() {
  const holdingsValue = Object.entries(portfolio.holdings).reduce((sum, [tk, h]) => {
    return sum + h.shares * (priceCache[tk]?.price || 0);
  }, 0);
  const totalValue = portfolio.cash + holdingsValue;

  // Only save if we have prices loaded
  if (Object.keys(priceCache).length === 0) return;

  const now = new Date();
  chartHistory.push({
    t: now.toISOString(),
    v: Math.round(totalValue * 100) / 100,
  });

  saveChartHistory(chartHistory);
}

// ══════════════════════════════════════════════════════════════════
//  1000+ STOCK UNIVERSE — 30 SECTORS
// ══════════════════════════════════════════════════════════════════
const STOCK_UNIVERSE = {

  // ═══ TECHNOLOGY ═══════════════════════════════════════════════
  "AI & Machine Learning": [
    "NVDA","PLTR","AI","PATH","SOUN","UPST","BBAI","PRCT","GFAI",
    "CGNX","ISRG","BRKS","MTTR","RCAT","DM","VUZI","AUVI","MARK",
    "RXRX","VRNS","GRAB","MVST","RGTI","QUBT","IONQ","ARQQ",
    "REKR","KITT","LQDT","VEEV",
  ],

  "Semiconductors": [
    "NVDA","AMD","TSM","AVGO","QCOM","TXN","INTC","MU","MRVL","LRCX",
    "AMAT","KLAC","ASML","ON","SWKS","MCHP","ADI","NXPI","STM",
    "WOLF","RMBS","SLAB","SITM","FORM","ALGM","DIOD","POWI","MPWR",
    "SMTC","AMBA","LSCC","MTSI","ACLS","OLED","CRUS","SYNA","ONTO",
    "MKSI","ENTG","AMKR","TER","COHR","IPGP","IRTC","VSH","AOSL",
    "HIMX","INDI","SIMO","GFS",
  ],

  "Software & SaaS": [
    "CRM","ADBE","NOW","SHOP","WDAY","ZM","TEAM","HUBS","DDOG","ZS",
    "NET","PANW","FTNT","MDB","ESTC","OKTA","DOCN","BILL","CFLT",
    "APP","TTD","U","TWLO","FIVN","ZI","PD","MNDY","GTLB","DT",
    "ASAN","BRZE","PCOR","APPF","TENB","VRNS","QTWO","RPD","FRSH",
    "ALTR","NCNO","PAYC","PCTY","TOST","FOUR","SQ","GWRE","MANH",
    "BSY","AZPN","CDNS","SNPS","ANSS","PTC","INTU","TYL","SMAR",
    "COUP","AVLR","PLAN","CRWD","S","QLYS","CYBR","FFIV","JAMF",
    "EVBG","KD","PRGS","BL","CALX","CWAN","INST","PWSC","RIOT",
    "API","FROG","SUMO","NEWR","SPT","WK","RAMP",
  ],

  "Big Tech": [
    "AAPL","MSFT","GOOGL","GOOG","AMZN","META","ORCL","IBM","SAP",
    "ACN","CSCO","TXN","ANET","HPE","HPQ","DELL","JNPR","NTAP",
  ],

  "Cloud & Data Infrastructure": [
    "SNOW","DDOG","MDB","CFLT","ESTC","NET","FSLY","GTLB","DOCN",
    "DT","NEWR","SUMO","CLDR","PSTG","NTAP","WDC","STX","SMCI",
    "RDDT","PINS","SNAP","DBX","BOX","ZUO","SPLK","VRNT","OTEX",
    "CIEN","INFN","VIAV",
  ],

  "Cybersecurity": [
    "CRWD","PANW","FTNT","ZS","S","QLYS","CYBR","TENB","VRNS",
    "RPD","OKTA","SAIL","EVTL","SCWX","RDWR","OSPN","SITO",
    "MNDT","CALT","RDOG",
  ],

  "Hardware & Components": [
    "AAPL","DELL","HPQ","HPE","SMCI","LNVGY","PSTG","NTAP","WDC",
    "STX","KEYS","ZBRA","GRMN","TDY","VIAV","LITE","IIVI","CIEN",
    "INFN","CALX","COMM","DLB","HEAR","KOSS","SONO","CRSR","LOGI",
    "SSYS","DDD","MKFG","NNDM","VNET","PRNT","XMTR","IMMR","PRFT",
    "DGII","CLFD","CMTL","BDC",
  ],

  "Gaming & Interactive": [
    "MSFT","SONY","NTDOY","EA","ATVI","TTWO","RBLX","DKNG","PENN",
    "PLTK","SKLZ","GMBL","MYPS","AGAE","SONN","ZNGA","GRVY","SLGG",
    "FNKO","GLBE",
  ],

  "Internet & E-commerce": [
    "AMZN","BABA","JD","PDD","SE","MELI","SHOP","ETSY","EBAY",
    "W","CHWY","WISH","OSTK","BIGC","VTEX","CPNG","GLBE","MNDY",
    "CARG","RVLV","FLWS","CVNA","REAL","OPEN","RDFN","TCOM","BKNG",
    "EXPE","ABNB","TRIP",
  ],

  "Social & Digital Media": [
    "META","SNAP","PINS","RDDT","TWTR","MTCH","BMBL","GRNDR",
    "DLO","LILM","MSGS","IAC","ANGI","CARG","YELP","ZG","TTGT",
    "DHC","EVC","IZEA",
  ],

  // ═══ FINANCE ══════════════════════════════════════════════════
  "Banks": [
    "JPM","BAC","WFC","C","GS","MS","USB","PNC","TFC","COF",
    "BK","STT","FITB","KEY","RF","CFG","HBAN","ZION","CMA","MTB",
    "FRC","SIVB","NYCB","WAL","PACW","FHN","EWBC","BOKF","WTFC",
    "GBCI","UMBF","SBCF","OZK","SNV","IBOC","ABCB","FFIN","BANF",
    "TCBI","HWC","PNFP","SFNC","HOPE","CATY","FNB","VLY","ONB",
    "UBSI","AUB","TOWN",
  ],

  "Fintech & Payments": [
    "V","MA","PYPL","SQ","ADYEY","FIS","FISV","GPN","AFRM","SOFI",
    "UPST","LC","BILL","FOUR","TOST","MELI","PAYO","RPAY","FLYW",
    "DLO","PSFE","COIN","NU","HOOD","LMND","ROOT","MQ","NUVEI",
    "EVTL","RELY",
  ],

  "Insurance": [
    "BRK-B","PGR","ALL","MET","PRU","AIG","AFL","TRV","HIG","CB",
    "CINF","WRB","RNR","EG","L","GL","KMPR","SIGI","RYAN","AON",
    "MMC","WTW","BRO","AJG","ERIE","KNSL","HCI","PLMR","ACGL","RLI",
  ],

  "Asset Management": [
    "BLK","SCHW","BEN","TROW","IVZ","AMG","VCTR","APAM","VRTS",
    "WDR","HLNE","CNS","STEP","ARES","APO","KKR","CG","BX","OWL",
    "BAM","TPG","NUVB","ASGN","EVR","HLI","PJT","GHL","MC","SF","RJF",
  ],

  // ═══ HEALTHCARE ═══════════════════════════════════════════════
  "Pharma": [
    "JNJ","PFE","ABBV","MRK","LLY","BMY","AMGN","GILD","REGN","VRTX",
    "AZN","NVS","SNY","GSK","NVO","ZTS","MRNA","BNTX","TAK",
    "TEVA","VTRS","OGN","PRGO","CTLT","JAZZ","NBIX","HZNP","UTHR",
    "INCY","EXEL","IOVA","RARE","FOLD","PTCT","SRPT","IONS","ALNY",
    "ARGX","BGNE","LEGN",
  ],

  "Biotech": [
    "MRNA","BNTX","SGEN","BIIB","ILMN","DXCM","NTRA","TWST","CDNA",
    "BIO","A","TMO","DHR","MTD","WAT","PKI","RVTY","CRL","MEDP",
    "ICLR","SYNH","WST","TECH","RGEN","AZTA","BCPC","NVCR","CRNX",
    "RCKT","APLS","KRYS","INSM","PCVX","DAWN","IMVT","SRRK","RVMD",
    "LNTH","XNCR","FATE",
  ],

  "Medical Devices": [
    "ABT","MDT","SYK","BSX","EW","ISRG","DXCM","PODD","ALGN",
    "HOLX","BAX","BDX","ZBH","COO","TFX","GEHC","GMED","MMSI",
    "NVCR","TNDM","SWAV","INSP","IRTC","AXNX","LIVN","ATRC",
    "SILK","PRCT","GKOS","RXST",
  ],

  // ═══ CONSUMER ═════════════════════════════════════════════════
  "Consumer Staples": [
    "PG","KO","PEP","COST","WMT","CL","MDLZ","MO","PM","KHC",
    "GIS","K","CPB","SJM","CAG","HRL","MKC","HSY","TSN","HLF",
    "CLX","CHD","CLORX","KMB","EL","MNST","CELH","KDP","TAP","STZ",
    "BUD","SAM","DEO","BF-B","FIZZ","COCO","ZVIA","OTLY","BYND",
    "SMPL",
  ],

  "Consumer Discretionary": [
    "NKE","SBUX","MCD","YUM","DPZ","CMG","WING","SHAK","QSR",
    "DIN","JACK","WEN","PZZA","BROS","DNUT","LULU","TPR","CPRI",
    "RL","PVH","HBI","GIII","VFC","UAA","DECK","SKX","CROX",
    "ONON","BIRK","HOKA",
  ],

  "Retail": [
    "WMT","TGT","COST","HD","LOW","TJX","ROST","BURL","DG","DLTR",
    "FIVE","OLLI","BBY","WSM","RH","ETSY","W","CHWY","KSS","M",
    "JWN","GPS","ANF","AEO","URBN","EXPR","BBWI","ULTA","COTY",
    "ELF","REVG","MNSO","PSMT","BJ","PRPL","LOVE","RCII","GES",
    "DKS","HIBB",
  ],

  "Food & Beverage": [
    "MCD","SBUX","YUM","CMG","DPZ","WING","QSR","DRI","TXRH",
    "CAKE","DENN","IHRT","BJRI","RRGB","PLAY","EAT","JACK","WEN",
    "PZZA","LOCO","ARCO","BROS","DNUT","SHAK","CAVA","FWRG",
    "SG","KRUS","LKNCY","FAT",
  ],

  // ═══ INDUSTRIALS ══════════════════════════════════════════════
  "Industrial & Manufacturing": [
    "CAT","DE","MMM","HON","GE","EMR","ROK","PH","ITW","DOV",
    "AME","NDSN","RRX","XYL","AOS","SWK","FAST","GWW","WSO",
    "MSM","LECO","LII","WTS","RBC","CW","HI","TT","IR","CARR",
    "OTIS","GEV","FTV","ROP","IEX","MIDD","PRLB","GNRC","ENPH",
    "SEDG","FSLR",
  ],

  "Aerospace & Defense": [
    "BA","LMT","RTX","NOC","GD","TDG","HWM","HII","LHX","LDOS",
    "BAH","KTOS","AVAV","RKLB","LUNR","RDW","BWXT","SPR","TGI",
    "HEI","MOG-A","CW","AXON","TXT","ERJ","JOBY","ACHR","PLTR",
    "GILT","PSN",
  ],

  "Transportation & Logistics": [
    "UPS","FDX","UNP","CSX","NSC","CP","CNI","JBHT","XPO","ODFL",
    "SAIA","CHRW","EXPD","HUBG","GXO","KNX","WERN","LSTR","SNDR",
    "ARCB","MRTN","HTLD","MATX","ZIM","DAC","GOGL","INSW","STNG",
    "TNP","EURN",
  ],

  // ═══ ENERGY ═══════════════════════════════════════════════════
  "Oil & Gas": [
    "XOM","CVX","COP","SLB","EOG","MPC","OXY","PSX","VLO","HES",
    "DVN","FANG","PXD","HAL","BKR","CTRA","MRO","APA","OVV","MGY",
    "MTDR","CHRD","SM","NOG","VTLE","DINO","PBF","DK","HFC","CVI",
    "CLNE","RRC","EQT","AR","SWN","CHK","GPOR","CNX","CEIX","BTU",
  ],

  "Renewable Energy": [
    "ENPH","SEDG","FSLR","RUN","NOVA","MAXN","ARRY","SHLS","STEM",
    "BLDP","PLUG","BE","CHPT","EVGO","BLNK","CLSK","HASI","CWEN",
    "NEP","AES","BEP","BEPC","ORA","GEL","AMPS","OPAL","FLNC",
    "ASTS","GEVO","AMRC",
  ],

  "Utilities": [
    "NEE","DUK","SO","D","AEP","EXC","SRE","XEL","WEC","ES",
    "ED","DTE","CMS","AEE","EVRG","PNW","NI","ATO","OGE","POR",
    "BKH","NWN","UTL","AWR","SJW","CWT","MGEE","OTTR","AVA","IDA",
  ],

  // ═══ AUTOS ════════════════════════════════════════════════════
  "Auto & EV": [
    "TSLA","F","GM","TM","HMC","STLA","RIVN","LCID","NIO","XPEV",
    "LI","VFS","FFIE","GOEV","FSR","WKHS","RIDE","NKLA","ARVL","REE",
    "PSNY","VLCN","MULN","ELMS","PTRA","GBX","LEA","BWA","ALV",
    "APTV",
  ],

  // ═══ TELECOM ══════════════════════════════════════════════════
  "Telecom": [
    "T","VZ","TMUS","LUMN","FTR","USM","TDS","SHEN","LBRDK","LBRDA",
    "CHTR","CMCSA","DIS","PARA","WBD","FOXA","NWSA","NXST","GTN",
    "SSP","ATUS","CABO","WOW","CNSL","GOGO","ASTS","OSAT","GILT",
    "LUMN","IDCC",
  ],

  // ═══ REAL ESTATE ══════════════════════════════════════════════
  "Real Estate & REITs": [
    "AMT","PLD","CCI","EQIX","SPG","O","PSA","DLR","WELL","AVB",
    "EQR","VTR","ARE","BXP","SLG","VNO","KIM","REG","FRT","NNN",
    "STOR","ADC","EPRT","IIPR","CUBE","EXR","LSI","NSA","MAA",
    "CPT","UDR","ESS","AIV","INVH","AMH","SUI","ELS","REXR",
    "STAG","LTC",
  ],

  // ═══ MATERIALS ════════════════════════════════════════════════
  "Materials & Chemicals": [
    "LIN","APD","SHW","ECL","DD","DOW","LYB","PPG","NEM","FCX",
    "FMC","CE","EMN","HUN","AXTA","RPM","ALB","LTHM","SQM","LAC",
    "MP","ALTM","PLL","LIVENT","WLK","OLN","TROX","KRO","IOSP",
    "HWKN",
  ],

  "Mining & Metals": [
    "NEM","GOLD","AEM","FNV","WPM","RGLD","NUE","STLD","CLF","X",
    "AA","CENX","KALU","ATI","CRS","HAYN","ZEUS","CMC","RS","MLM",
    "VMC","EXP","ITE","ARCH","HCC","AMR","TECK","RIO","BHP","VALE",
  ],

  // ═══ MEDIA & ENTERTAINMENT ════════════════════════════════════
  "Media & Entertainment": [
    "DIS","NFLX","CMCSA","PARA","WBD","FOXA","LYV","IMAX","CNK",
    "AMC","SPOT","TME","ROKU","FUBO","CURI","GENI","LULU","MSGS",
    "BATRA","MSG","EDR","TKO","WWE","DKNG","PENN","MGM","CZR",
    "WYNN","LVS","BYD",
  ],

  // ═══ CHINESE TECH ═════════════════════════════════════════════
  "Chinese Tech": [
    "BABA","JD","PDD","BIDU","NIO","XPEV","LI","BILI","IQ","TME",
    "ZH","MNSO","DIDI","TCOM","LKNCY","YMM","TUYA","VNET","KC",
    "QFIN","FINV","LX","GDS","BEKE","TAL","EDU","GOTU","DAO",
    "DDL","TIGR",
  ],

  // ═══ ETFS ═════════════════════════════════════════════════════
  "ETFs & Index": [
    "SPY","QQQ","DIA","IWM","VTI","VOO","VT","VXUS","VGK","VWO",
    "EEM","EFA","ARKK","ARKG","ARKF","ARKW","ARKQ","XLK","XLF",
    "XLE","XLV","XLI","XLP","XLY","XLB","XLU","XLRE","SMH","SOXX",
    "HACK","BOTZ","ROBO","AIQ","IRBO","WCLD","IGV","CLOU","BUG",
    "KWEB","MCHI",
  ],

  // ═══ CRYPTO ═══════════════════════════════════════════════════
  "Crypto & Blockchain": [
    "COIN","MSTR","MARA","RIOT","CLSK","HUT","BITF","HIVE",
    "BTBT","CAN","CIFR","IREN","CORZ","WULF","BTDR","GREE",
    "DMGF","SDIG","APLD","SOS",
  ],

  // ═══ ADDITIONAL TECH & MISC ═══════════════════════════════════
  "IT Services & Consulting": [
    "ACN","CTSH","INFY","WIT","EPAM","GLOB","EXLS","G","GIB","DXC",
    "LDOS","SAIC","BAH","CACI","MANT","ICE","VRSN","GDDY","WEX",
    "JKHY","FI","BR","FLT","NDAQ","CBOE","CME","MKTX","TW","MSCI",
    "SPGI",
  ],

  "Robotics & Automation": [
    "ISRG","IRBT","BRKS","CGNX","ROCK","ROK","ABB","FANUY","KUKA",
    "TER","ZBRA","GNRC","AZTA","NOVT","COHR","IPGP","MKSI","ESE",
    "LFUS","AMSC",
  ],

  "Space & Satellite": [
    "RKLB","LUNR","RDW","ASTS","SPIR","BKSY","MNTS","ASTR","VORB",
    "MAXR","GSAT","IRDM","VSAT","DISH","SATS","GILT","OSAT","PKE",
    "KTOS","AJRD",
  ],

  "3D Printing & Additive": [
    "DDD","SSYS","MKFG","NNDM","DM","XONE","MTLS","VJET","PRLB",
    "XMTR",
  ],

  "Quantum Computing": [
    "IONQ","RGTI","QUBT","ARQQ","QBTS","FORM","SOUN","KULR",
    "LASR","CEVA",
  ],
};

const ALL_TICKERS = [...new Set(Object.values(STOCK_UNIVERSE).flat())];
const TICKER_SECTOR = {};
for (const [sector, tickers] of Object.entries(STOCK_UNIVERSE)) {
  for (const t of tickers) {
    if (!TICKER_SECTOR[t]) TICKER_SECTOR[t] = sector; // first sector wins
  }
}

console.log(`Stock universe: ${ALL_TICKERS.length} unique tickers across ${Object.keys(STOCK_UNIVERSE).length} sectors`);

// ── Price Cache ──────────────────────────────────────────────────
let priceCache = {};
let lastFetchTime = 0;
const CACHE_TTL = 60_000; // 60s for 1000+ stocks
let fetchInProgress = false;

async function fetchPrices(force = false) {
  const now = Date.now();
  if (!force && now - lastFetchTime < CACHE_TTL && Object.keys(priceCache).length > 0) {
    return priceCache;
  }
  if (fetchInProgress) return priceCache;
  fetchInProgress = true;

  const allTickers = [...new Set([...ALL_TICKERS, ...Object.keys(portfolio.holdings)])];
  const results = { ...priceCache }; // keep old data as fallback

  // Batch in chunks of 30
  const chunks = [];
  for (let i = 0; i < allTickers.length; i += 30) {
    chunks.push(allTickers.slice(i, i + 30));
  }

  let fetched = 0;
  for (const chunk of chunks) {
    try {
      const quotes = await yahooFinance.quote(chunk);
      for (const q of quotes) {
        if (!q || !q.symbol || !q.regularMarketPrice) continue;
        results[q.symbol] = {
          ticker: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          sector: TICKER_SECTOR[q.symbol] || "Other",
          price: q.regularMarketPrice || 0,
          change: q.regularMarketChange || 0,
          changePercent: q.regularMarketChangePercent || 0,
          dayHigh: q.regularMarketDayHigh || 0,
          dayLow: q.regularMarketDayLow || 0,
          prevClose: q.regularMarketPreviousClose || 0,
          volume: q.regularMarketVolume || 0,
          marketCap: q.marketCap || 0,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || 0,
          fiftyTwoWeekLow: q.fiftyTwoWeekLow || 0,
          marketState: q.marketState || "CLOSED",
        };
        fetched++;
      }
    } catch (err) {
      // Skip failed batches silently
    }
    // Small delay between batches to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  if (fetched > 0) {
    priceCache = results;
    lastFetchTime = now;
  }
  fetchInProgress = false;
  console.log(`[${new Date().toLocaleTimeString()}] Fetched ${fetched} prices (${Object.keys(priceCache).length} total cached)`);
  return priceCache;
}

// ── API Routes ───────────────────────────────────────────────────

// GET /api/quote/:ticker — get live price for ANY ticker
app.get("/api/quote/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    // Check cache first
    if (priceCache[ticker]) return res.json({ success: true, ...priceCache[ticker] });
    // Fetch from Yahoo
    const quotes = await yahooFinance.quote([ticker]);
    if (quotes && quotes[0] && quotes[0].regularMarketPrice) {
      const q = quotes[0];
      const data = {
        ticker: q.symbol || ticker,
        name: q.shortName || q.longName || ticker,
        sector: TICKER_SECTOR[ticker] || "Other",
        price: q.regularMarketPrice,
        change: q.regularMarketChange || 0,
        changePercent: q.regularMarketChangePercent || 0,
      };
      priceCache[ticker] = data;
      return res.json({ success: true, ...data });
    }
    res.status(404).json({ success: false, error: "Ticker not found" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/sectors", (req, res) => {
  const summary = {};
  for (const [sector, tickers] of Object.entries(STOCK_UNIVERSE)) {
    summary[sector] = tickers.length;
  }
  res.json({ success: true, sectors: Object.keys(STOCK_UNIVERSE), sectorCounts: summary, totalUnique: ALL_TICKERS.length });
});

app.get("/api/prices", async (req, res) => {
  try {
    const allPrices = await fetchPrices();
    const sector = req.query.sector;
    const search = (req.query.search || "").toLowerCase();
    const sort = req.query.sort || "ticker";
    const dir = req.query.dir === "desc" ? -1 : 1;
app.get("/api/q/:t", async (req, res) => {
  try {
    const t = req.params.t.toUpperCase();
    if (priceCache[t]) return res.json({ success: true, price: priceCache[t].price, ticker: t, name: priceCache[t].name });
    const q = await yahooFinance.quote([t]);
    if (q && q[0] && q[0].regularMarketPrice) {
      priceCache[t] = { ticker: q[0].symbol || t, name: q[0].shortName || t, sector: "Other", price: q[0].regularMarketPrice, change: q[0].regularMarketChange || 0, changePercent: q[0].regularMarketChangePercent || 0 };
      return res.json({ success: true, price: q[0].regularMarketPrice, ticker: t, name: q[0].shortName || t });
    }
    res.status(404).json({ success: false, error: "Not found" });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
    let list = Object.values(allPrices);

    // Filter by sector
    if (sector && sector !== "All" && STOCK_UNIVERSE[sector]) {
      const sectorTickers = new Set(STOCK_UNIVERSE[sector]);
      list = list.filter(s => sectorTickers.has(s.ticker));
    }

    // Filter by search
    if (search) {
      list = list.filter(s => s.ticker.toLowerCase().includes(search) || s.name.toLowerCase().includes(search));
    }

    res.json({
      success: true,
      prices: list,
      totalCached: Object.keys(allPrices).length,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/portfolio", async (req, res) => {
  try {
    const prices = await fetchPrices();
    let holdingsValue = 0;
    const holdingsDetail = {};

    for (const [ticker, h] of Object.entries(portfolio.holdings)) {
      const livePrice = prices[ticker]?.price || 0;
      const mktValue = h.shares * livePrice;
      const costBasis = h.shares * h.avgCost;
      holdingsValue += mktValue;
      holdingsDetail[ticker] = {
        ...h,
        sector: TICKER_SECTOR[ticker] || prices[ticker]?.sector || "Other",
        currentPrice: livePrice,
        marketValue: mktValue,
        costBasis,
        unrealizedPnl: mktValue - costBasis,
        unrealizedPct: costBasis > 0 ? ((mktValue - costBasis) / costBasis) * 100 : 0,
        dailyChange: (prices[ticker]?.change || 0) * h.shares,
        dailyChangePct: prices[ticker]?.changePercent || 0,
      };
    }

    const totalValue = portfolio.cash + holdingsValue;
    const totalPnl = totalValue - portfolio.startValue;
    const totalReturn = ((totalValue - portfolio.startValue) / portfolio.startValue) * 100;

    res.json({
      success: true, cash: portfolio.cash, holdingsValue, totalValue,
      totalPnl, totalReturn, holdings: holdingsDetail,
      tradeLog: portfolio.tradeLog.slice(-200),
      createdAt: portfolio.createdAt,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/buy", async (req, res) => {
  try {
    const { ticker, amount } = req.body;
    if (!ticker || !amount || amount <= 0)
      return res.status(400).json({ success: false, error: "Invalid ticker or amount" });
    if (amount > portfolio.cash)
      return res.status(400).json({ success: false, error: `Not enough cash — you have $${portfolio.cash.toFixed(2)} but this trade costs $${parseFloat(amount).toFixed(2)}` });

    // Try cached price first, then fetch directly from Yahoo for any ticker
    let prices = await fetchPrices();
    let stockPrice = prices[ticker]?.price;
    if (!stockPrice) {
      try {
        const quotes = await yahooFinance.quote([ticker]);
        if (quotes && quotes[0] && quotes[0].regularMarketPrice) {
          stockPrice = quotes[0].regularMarketPrice;
          // Cache it so portfolio page can show live price later
          priceCache[ticker] = {
            ticker: quotes[0].symbol || ticker,
            name: quotes[0].shortName || quotes[0].longName || ticker,
            sector: TICKER_SECTOR[ticker] || "Other",
            price: stockPrice,
            change: quotes[0].regularMarketChange || 0,
            changePercent: quotes[0].regularMarketChangePercent || 0,
            dayHigh: quotes[0].regularMarketDayHigh || 0,
            dayLow: quotes[0].regularMarketDayLow || 0,
            prevClose: quotes[0].regularMarketPreviousClose || 0,
            volume: quotes[0].regularMarketVolume || 0,
            marketCap: quotes[0].marketCap || 0,
            marketState: quotes[0].marketState || "CLOSED",
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (!stockPrice)
      return res.status(400).json({ success: false, error: "No price for " + ticker });

    const shares = amount / stockPrice;
    const existing = portfolio.holdings[ticker];
    if (existing) {
      const ts = existing.shares + shares;
      const tc = existing.shares * existing.avgCost + amount;
      existing.shares = ts;
      existing.avgCost = tc / ts;
    } else {
      portfolio.holdings[ticker] = { shares, avgCost: stockPrice };
    }

    portfolio.cash -= amount;
    portfolio.tradeLog.push({ time: new Date().toISOString(), action: "BUY", ticker, shares, price: stockPrice, amount });
    saveState(portfolio);
    res.json({ success: true, message: `Bought ${shares.toFixed(6)} shares of ${ticker} @ $${stockPrice.toFixed(2)}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/sell", async (req, res) => {
  try {
    const { ticker, fraction } = req.body;
    if (!ticker || !fraction || fraction <= 0 || fraction > 1)
      return res.status(400).json({ success: false, error: "Invalid" });
    const holding = portfolio.holdings[ticker];
    if (!holding || holding.shares <= 0)
      return res.status(400).json({ success: false, error: "No shares" });

    const prices = await fetchPrices(true);
    const stockPrice = prices[ticker]?.price;
    if (!stockPrice) return res.status(400).json({ success: false, error: "No price" });

    const sellShares = holding.shares * fraction;
    const amount = sellShares * stockPrice;
    holding.shares -= sellShares;
    if (holding.shares < 1e-7) delete portfolio.holdings[ticker];

    portfolio.cash += amount;
    portfolio.tradeLog.push({ time: new Date().toISOString(), action: "SELL", ticker, shares: sellShares, price: stockPrice, amount });
    saveState(portfolio);
    res.json({ success: true, message: `Sold ${sellShares.toFixed(6)} shares of ${ticker} @ $${stockPrice.toFixed(2)}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/reset", (req, res) => {
  portfolio = { ...DEFAULT_STATE, createdAt: new Date().toISOString() };
  saveState(portfolio);
  chartHistory = [];
  saveChartHistory(chartHistory);
  res.json({ success: true, message: "Portfolio reset to $10,000" });
});

// GET /api/chart-history — persistent chart data
app.get("/api/chart-history", (req, res) => {
  res.json({ success: true, history: chartHistory });
});

// ══════════════════════════════════════════════════════════════════
require("./fix")(app, yahooFinance, priceCache);
//  QUANT ENGINE API ROUTES
// ══════════════════════════════════════════════════════════════════

// Helper: fetch & cache historical data for a ticker
async function loadHistory(ticker, period = "6mo") {
  if (quant.getHistory(ticker)) return quant.getHistory(ticker);
  try {
    const result = await yahooFinance.chart(ticker, { period1: getStartDate(period), period2: new Date() });
    if (!result || !result.quotes || !result.quotes.length) return null;
    const quotes = result.quotes.filter(q => q.close != null);
    const data = {
      dates: quotes.map(q => q.date),
      closes: quotes.map(q => q.close),
      highs: quotes.map(q => q.high || q.close),
      lows: quotes.map(q => q.low || q.close),
      volumes: quotes.map(q => q.volume || 0),
    };
    quant.setHistory(ticker, data);
    return data;
  } catch (err) {
    console.error(`History fetch error for ${ticker}:`, err.message);
    return null;
  }
}

function getStartDate(period) {
  const d = new Date();
  if (period === "1mo") d.setMonth(d.getMonth() - 1);
  else if (period === "3mo") d.setMonth(d.getMonth() - 3);
  else if (period === "6mo") d.setMonth(d.getMonth() - 6);
  else if (period === "1y") d.setFullYear(d.getFullYear() - 1);
  else if (period === "2y") d.setFullYear(d.getFullYear() - 2);
  else d.setMonth(d.getMonth() - 6);
  return d;
}

// GET /api/quant/scan — scan multiple tickers with all models
app.get("/api/quant/scan", async (req, res) => {
  try {
    const tickers = (req.query.tickers || "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,JPM,SPY,QQQ").split(",").slice(0, 30);
    const period = req.query.period || "6mo";

    const results = [];
    for (const ticker of tickers) {
      await loadHistory(ticker.trim(), period);
      const composite = quant.compositeSignal(ticker.trim());
      if (composite) results.push(composite);
    }

    // Sort by absolute score (strongest signals first)
    results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    res.json({ success: true, results, count: results.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/quant/analyze/:ticker — deep analysis of a single ticker
app.get("/api/quant/analyze/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const period = req.query.period || "6mo";

    await loadHistory(ticker, period);

    const meanReversion = quant.meanReversionSignal(ticker);
    const momentum = quant.momentumSignal(ticker);
    const volatility = quant.volatilitySignal(ticker);
    const ml = quant.mlSignal(ticker);
    const composite = quant.compositeSignal(ticker);

    if (!composite) {
      return res.status(404).json({ success: false, error: "Insufficient data for " + ticker });
    }

    res.json({
      success: true,
      ticker,
      composite,
      models: { meanReversion, momentum, volatility, ml },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/quant/pairs — stat arb pairs analysis
app.get("/api/quant/pairs", async (req, res) => {
  try {
    const tickerA = (req.query.a || "AAPL").toUpperCase();
    const tickerB = (req.query.b || "MSFT").toUpperCase();
    const period = req.query.period || "6mo";

    await loadHistory(tickerA, period);
    await loadHistory(tickerB, period);

    const result = quant.statArbSignal(tickerA, tickerB);
    if (!result) {
      return res.status(404).json({ success: false, error: "Insufficient data" });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Predefined correlated pairs for scanning
const POPULAR_PAIRS = [
  ["AAPL", "MSFT"], ["GOOGL", "META"], ["NVDA", "AMD"], ["JPM", "GS"],
  ["XOM", "CVX"], ["V", "MA"], ["KO", "PEP"], ["BA", "LMT"],
  ["HD", "LOW"], ["UNH", "CI"], ["DIS", "NFLX"], ["CAT", "DE"],
  ["AMZN", "SHOP"], ["CRM", "NOW"], ["SPY", "QQQ"], ["TSLA", "RIVN"],
];

app.get("/api/quant/pairs/scan", async (req, res) => {
  try {
    const period = req.query.period || "6mo";
    const results = [];

    for (const [a, b] of POPULAR_PAIRS) {
      await loadHistory(a, period);
      await loadHistory(b, period);
      const result = quant.statArbSignal(a, b);
      if (result) results.push(result);
    }

    results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    res.json({ success: true, results, count: results.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/quant/backtest/:ticker — backtest a strategy
app.get("/api/quant/backtest/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const strategy = req.query.strategy || "combined";
    const period = req.query.period || "1y";

    await loadHistory(ticker, period);

    const momentum = quant.backtest(ticker, "momentum");
    const meanReversion = quant.backtest(ticker, "meanReversion");
    const combined = quant.backtest(ticker, "combined");

    if (!combined) {
      return res.status(404).json({ success: false, error: "Insufficient data for backtest" });
    }

    res.json({
      success: true,
      ticker,
      strategies: {
        momentum: momentum ? { ...momentum, portfolioValues: undefined } : null,
        meanReversion: meanReversion ? { ...meanReversion, portfolioValues: undefined } : null,
        combined: combined ? { ...combined, portfolioValues: undefined } : null,
      },
      // Include portfolio values for chart (combined only to save bandwidth)
      chartData: combined?.portfolioValues || [],
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/quant/risk — portfolio risk analysis
app.get("/api/quant/risk", async (req, res) => {
  try {
    const prices = await fetchPrices();

    // Load history for all holdings
    for (const ticker of Object.keys(portfolio.holdings)) {
      await loadHistory(ticker, "3mo");
    }

    const risk = quant.riskAnalysis(portfolio, prices);
    res.json({ success: true, ...risk });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/quant/screener — find top opportunities
app.get("/api/quant/screener", async (req, res) => {
  try {
    const type = req.query.type || "momentum"; // momentum, oversold, volatile, all
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    // Screen a curated list of liquid stocks
    const screenList = [
      "AAPL","MSFT","NVDA","GOOGL","META","AMZN","TSLA","JPM","GS","V",
      "MA","NFLX","AMD","CRM","ADBE","INTC","PYPL","SQ","SHOP","COIN",
      "PLTR","SNOW","NET","DDOG","CRWD","PANW","MDB","NIO","RIVN","SOFI",
      "IONQ","SOUN","AI","PATH","RKLB","SPY","QQQ","XOM","LLY","UNH",
      "BA","CAT","HD","MCD","KO","PFE","DIS","ABNB","UBER","LYFT",
    ];

    const results = [];
    for (const ticker of screenList) {
      await loadHistory(ticker, "6mo");
      let signal;
      if (type === "momentum") signal = quant.momentumSignal(ticker);
      else if (type === "oversold") signal = quant.meanReversionSignal(ticker);
      else if (type === "volatile") signal = quant.volatilitySignal(ticker);
      else signal = quant.compositeSignal(ticker);

      if (signal) results.push(signal);
    }

    // Sort appropriately
    if (type === "momentum") {
      results.sort((a, b) => b.score - a.score);
    } else if (type === "oversold") {
      results.sort((a, b) => b.score - a.score); // highest buy score first
    } else {
      results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    }

    res.json({ success: true, results: results.slice(0, limit), type, screened: screenList.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ╔════════════════════════════════════════════════════╗`);
  console.log(`  ║   QuantTrader v4                                    ║`);
  console.log(`  ║   ${ALL_TICKERS.length} stocks across ${Object.keys(STOCK_UNIVERSE).length} sectors                  ║`);
  console.log(`  ║   http://localhost:${PORT}                              ║`);
  console.log(`  ╚════════════════════════════════════════════════════╝\n`);
  console.log(`  Chart history: ${chartHistory.length} saved data points`);
  console.log("  Fetching initial prices (this may take 30-60s for 1000+ stocks)...\n");
  fetchPrices().then(p => {
    console.log(`  Ready! ${Object.keys(p).length} stocks loaded.\n`);
    // Take first snapshot once prices are loaded
    snapshotPortfolioValue();
  });

  // Snapshot portfolio value every 60 seconds while running
  setInterval(snapshotPortfolioValue, 60_000);
});