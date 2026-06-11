import { Activity, Telescope, Shield, Globe, Swords, Wallet } from 'lucide-react';

export const ROADMAP = [
  { tier: 'BUILT', color: '#38e08a', items: [
    { name: '6-Agent Council', desc: '6 specialists → PM ruling on any buy idea' },
    { name: 'Account Selector', desc: 'Edwin / Dad / Bro — sizing judged per account' },
    { name: 'Capital Input', desc: 'State available cash; Position Sizer returns dollars + shares' },
    { name: 'Smart DCA Allocator', desc: 'Routes weekly/monthly DCA into the best dip, not spread thin' },
    { name: 'Sell-Protocol Watchdog', desc: 'Scans all holdings; flags only confirmed weekly downtrends' },
  ]},
  { tier: 'HIGH VALUE — NEXT', color: '#f5c451', items: [
    { name: 'Council on Holdings (HOLD/TRIM)', desc: 'Same 6 agents pointed at what you already own, not just new buys' },
    { name: 'Scout Mode', desc: 'Council auto-runs on your watchlist; surfaces only 7+ that pass the gates' },
    { name: 'Alpha Tracker vs SPY', desc: 'Logs every ruling, grades it later vs SPY — is the council making money?' },
  ]},
  { tier: 'STRONG EDGE', color: '#38e0d4', items: [
    { name: 'Earnings Radar', desc: 'Countdown to every holding\'s earnings + auto pre-earnings council review 3 days out' },
    { name: 'Correlation Heatmap', desc: 'Visual of how clustered the AI-infra bets really are — concentration at a glance' },
    { name: 'Devil\'s Advocate Stress Test', desc: 'Bear agent goes max-aggressive on any holding to pressure-test the thesis' },
  ]},
];

export const PROTOCOLS = `
SELL PROTOCOL: Exit ONLY when red candles are forming AND a downtrend is confirmed (lower highs / lower lows on the WEEKLY chart). Never sell on valuation, RSI, or news alone.
4-GATE ENTRY RULE (all four for a new entry): (1) catalyst within 60 days, (2) weekly chart in uptrend, (3) min 7/10 conviction + clear bull thesis, (4) no entries on macro headwind days.
Sizing: small starter only, scale up after price action confirms. The book is ~80% AI infrastructure / semiconductors.
`;

export const ACCOUNTS = {
  edwin: { label: 'Edwin', sub: 'Fidelity Youth', holdings: ['NVDA','NBIS','MU','AMD','SNDK','CRDO','APLD','ALAB','FLY'], dca: 60, dcaNote: '$60/week, Mondays' },
  dad:   { label: 'Dad',   sub: 'Fidelity',       holdings: ['NVDA','NBIS','MU','AMD','SNDK','CRDO','APLD','ALAB'],        dca: 50, dcaNote: '$50/month' },
  bro:   { label: 'Bro',   sub: 'Robinhood',      holdings: ['NVDA','NBIS','MU','AMD','SNDK','CRDO','APLD','ALAB'],        dca: 0,  dcaNote: 'no DCA' },
};

export const AGENTS = [
  { id: 'technical', name: 'Technical Analyst',  role: 'Sell Protocol + 4-Gate chart check',    icon: Activity,  accent: '#4ecdc4', search: true,
    system: `You are the TECHNICAL ANALYST on an investment council. ${PROTOCOLS}
Your ONLY job: judge the chart for the given ticker. Search the web for recent price action, weekly trend, key levels. Is the weekly in an uptrend? Are red candles forming into a confirmed downtrend? Where is support/resistance?
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words max>","points":["<short>","<short>","<short>"]}` },

  { id: 'catalyst',  name: 'Catalyst Scout',     role: 'Catalyst within 60 days?',              icon: Telescope, accent: '#c8922a', search: true,
    system: `You are the CATALYST SCOUT on an investment council. ${PROTOCOLS}
Your ONLY job: find whether the ticker has a hard catalyst within 60 days (earnings, launch, regulatory, guidance). Search for the next earnings date. State the bull thesis in one line.
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words max>","points":["<catalyst + date>","<bull thesis>","<short>"]}` },

  { id: 'risk',      name: 'Risk Manager',        role: 'Sizing, concentration, dilution',       icon: Shield,    accent: '#5a96e8', search: true,
    system: `You are the RISK MANAGER on an investment council. ${PROTOCOLS}
Your ONLY job: assess risk of ADDING this ticker to the account described in the prompt. Concerns: concentration vs the account's existing holdings, dilution/share-count flags (search for recent secondaries/heavy SBC), beta/volatility, suggested starter size.
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10 where 10=low risk>,"headline":"<8 words max>","points":["<concentration take>","<dilution/vol flag>","<sizing rec>"]}` },

  { id: 'macro',     name: 'Macro Agent',         role: 'Headwind-day check (Gate 4)',           icon: Globe,     accent: '#9b72e8', search: true,
    system: `You are the MACRO AGENT on an investment council. ${PROTOCOLS}
Your ONLY job: judge today's macro tape for Gate 4. Search for TODAY's conditions: Fed/rates, CPI, oil, Iran/Middle East, semiconductor tone. Is today a macro headwind day where new entries should pause?
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10 where 10=clear skies>,"headline":"<8 words max>","points":["<rates/CPI>","<oil/geopolitics>","<sector tone>"]}` },

  { id: 'bear',      name: "Devil's Advocate",    role: 'Forced to argue AGAINST',               icon: Swords,    accent: '#e85c5c', search: true,
    system: `You are the DEVIL'S ADVOCATE on an investment council. ${PROTOCOLS}
Your ONLY job: build the strongest BEAR case against buying this ticker now. Search for risks, bear theses, valuation concerns, competitive threats, downgrades. Be sharp and specific.
Respond ONLY with JSON in a \`\`\`json block: {"stance":"BEARISH","score":<0-10 strength-of-bear-case>,"headline":"<8 words max>","points":["<bear>","<bear>","<bear>"]}` },

  { id: 'sizer',     name: 'Position Sizer',      role: 'Turns the call into dollars + shares',  icon: Wallet,    accent: '#2fcb8a', search: true,
    system: `You are the POSITION SIZER on an investment council. ${PROTOCOLS}
Your ONLY job: translate the decision into concrete numbers for the stated available capital and account. Search for the ticker's CURRENT share price. Compute a small starter dollar amount, approximate shares at current price, and % of available capital. If no capital stated, give % guidance. Keep starters genuinely small.
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10 where 10=fits cleanly>,"headline":"<8 words max>","points":["<starter $ + approx shares>","<% of available capital>","<scale-up plan>"]}` },
];

export const STANCE_STYLE = {
  PASS:       { bg: 'rgba(47,203,138,0.12)',  fg: '#2fcb8a', label: 'PASS' },
  FAIL:       { bg: 'rgba(232,92,92,0.12)',   fg: '#e85c5c', label: 'FAIL' },
  CAUTION:    { bg: 'rgba(200,146,42,0.12)',  fg: '#c8922a', label: 'CAUTION' },
  BEARISH:    { bg: 'rgba(232,92,92,0.12)',   fg: '#e85c5c', label: 'BEAR CASE' },
  BUY:        { bg: 'rgba(47,203,138,0.14)',  fg: '#2fcb8a', label: 'BUY' },
  WATCH:      { bg: 'rgba(200,146,42,0.14)',  fg: '#c8922a', label: 'WATCH' },
  PASS_FINAL: { bg: 'rgba(232,92,92,0.14)',   fg: '#e85c5c', label: 'PASS' },
};

export const WD_STYLE = {
  HOLD:  { bg: 'rgba(47,203,138,0.12)',  fg: '#2fcb8a', label: 'HOLD' },
  WATCH: { bg: 'rgba(200,146,42,0.12)',  fg: '#c8922a', label: 'WATCH' },
  SELL:  { bg: 'rgba(232,92,92,0.14)',   fg: '#e85c5c', label: 'SELL SIGNAL' },
};

// ---- Demo data (Phase C will remove these) ----
export const DEMO_TICKER = 'AAPL';
export const DEMO_RESULTS = {
  technical: { stance: 'CAUTION', score: 6, headline: 'Uptrend intact, momentum cooling',   points: ['Weekly still higher-highs/higher-lows','Stalling under recent resistance','No confirmed downtrend - HOLD logic'] },
  catalyst:  { stance: 'PASS',    score: 7, headline: 'Earnings + WWDC inside 60 days',     points: ['Next earnings ~late July (in window)','AI/Siri refresh is the thesis','Services growth still the engine'] },
  risk:      { stance: 'PASS',    score: 8, headline: 'Actually diversifies your book',      points: ['Outside your ~80% AI-infra cluster','Low beta, clean balance sheet','Starter: 3-5% of new capital'] },
  macro:     { stance: 'CAUTION', score: 5, headline: 'CPI midweek, choppy tape',            points: ['Rate-hike odds elevated post-jobs','Oil firm on Middle East risk','Mega-cap holds up better than high-beta'] },
  bear:      { stance: 'BEARISH', score: 6, headline: 'Growth premium, thin catalysts',      points: ['Hardware revenue near-flat','China demand + regulatory overhang','Priced for an AI win not yet shipped'] },
  sizer:     { stance: 'CAUTION', score: 6, headline: 'Starter only - keep powder dry',      points: ['Starter ~$80-100 (approx 0.4 sh @ ~$205)','approx 4-5% of your $2,000 available','Scale toward ~10% after weekly confirms'] },
};
export const DEMO_SYNTH = { verdict: 'WATCH', conviction: 6, sizing: 'Starter 3-5% only; add after CPI clears', summary: 'AAPL is a quality, lower-risk name that would diversify your AI-heavy book — but conviction lands at 6, under your 7 threshold, and CPI midweek is a macro headwind. Gates 3 and 4 aren\'t cleanly passed. Watch it, don\'t chase it.', bull: ['Diversifies concentration risk','Catalyst window is open'], risks: ['Conviction below 7-gate','Macro headwind day (CPI)'] };
export const DEMO_DCA = { allocations: [{ ticker: 'AMD', amount: 35, pct: 58, reason: 'Hardest hit Friday (-10.9%), sitting on 20-day support, weekly uptrend intact' },{ ticker: 'MU', amount: 25, pct: 42, reason: 'HBM4 catalyst locked, oversold after -13% but thesis unchanged' }], summary: "Concentrating this week's $60 into the two best dips rather than spreading thin across 9 names. Both still in weekly uptrends — buying weakness, not catching knives. Skipped FLY (tripping sell protocol)." };
export const DEMO_WD = [
  { ticker: 'NVDA', status: 'HOLD',  note: 'Higher highs intact; one red week is not a trend' },
  { ticker: 'NBIS', status: 'HOLD',  note: 'Parabolic but structure unbroken; high beta' },
  { ticker: 'MU',   status: 'HOLD',  note: 'Sharp pullback, weekly uptrend still up' },
  { ticker: 'AMD',  status: 'HOLD',  note: 'Near 20-day support, no lower low yet' },
  { ticker: 'SNDK', status: 'WATCH', note: 'Parabolic - watch for first weekly lower high' },
  { ticker: 'CRDO', status: 'HOLD',  note: 'Relative strength, barely dipped in selloff' },
  { ticker: 'APLD', status: 'WATCH', note: 'Volatile; testing support, not broken' },
  { ticker: 'ALAB', status: 'HOLD',  note: 'Off ATH but uptrend intact' },
  { ticker: 'FLY',  status: 'SELL',  note: 'Lower highs/lower lows since IPO peak, below secondary price — protocol tripped' },
];
