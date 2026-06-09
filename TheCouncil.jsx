import React, { useState, useEffect, useRef } from "react";
import { Activity, Telescope, Shield, Globe, Swords, Crown, Loader2, AlertTriangle, ChevronRight, TrendingUp, Search, Play, Wallet, Coins, Radar, Check, Eye, X, Map, CircleDot, Clock, MessageSquare, Mic, MicOff, Volume2, VolumeX, Send, Briefcase, Plus } from "lucide-react";

// ---- Roadmap: everything recommended, what's built vs planned ----
const ROADMAP = [
  { tier: "BUILT", color: "#38e08a", items: [
    { name: "6-Agent Council", desc: "Technical, Catalyst, Risk, Macro, Devil's Advocate, Position Sizer → PM ruling on any buy" },
    { name: "Account Selector", desc: "Edwin / Dad / Bro — concentration + sizing judged per account" },
    { name: "Capital Input", desc: "State available cash; Position Sizer returns dollars + shares" },
    { name: "Smart DCA Allocator", desc: "Routes your weekly/monthly DCA into the best dip, not spread thin" },
    { name: "Sell-Protocol Watchdog", desc: "Scans all holdings; flags only confirmed weekly downtrends (the FLY catch)" },
  ]},
  { tier: "HIGH VALUE — NEXT", color: "#f5c451", items: [
    { name: "Council on Holdings (HOLD/TRIM)", desc: "Same 6 agents pointed at what you already own, not just new buys" },
    { name: "Scout Mode", desc: "Council auto-runs on your watchlist (OKLO, LPTH, UNH, KKR…); surfaces only 7+ that pass the gates" },
    { name: "Alpha Tracker vs SPY", desc: "Logs every ruling, grades it later vs SPY — is the council actually making money?" },
  ]},
  { tier: "STRONG EDGE", color: "#38e0d4", items: [
    { name: "Earnings Radar", desc: "Countdown to every holding's earnings + auto pre-earnings council review 3 days out" },
    { name: "Correlation Heatmap", desc: "Visual of how clustered the AI-infra bets really are — concentration at a glance" },
    { name: "Devil's Advocate Stress Test", desc: "Bear agent goes max-aggressive on any holding to pressure-test the thesis" },
  ]},
];

// ---- Shared protocol context ----
const PROTOCOLS = `
SELL PROTOCOL: Exit ONLY when red candles are forming AND a downtrend is confirmed (lower highs / lower lows on the WEEKLY chart). Never sell on valuation, RSI, or news alone.
4-GATE ENTRY RULE (all four for a new entry): (1) catalyst within 60 days, (2) weekly chart in uptrend, (3) min 7/10 conviction + clear bull thesis, (4) no entries on macro headwind days.
Sizing: small starter only, scale up after price action confirms. The book is ~80% AI infrastructure / semiconductors.
`;

const ACCOUNTS = {
  edwin: { label: "Edwin", sub: "Fidelity Youth", holdings: ["NVDA", "NBIS", "MU", "AMD", "SNDK", "CRDO", "APLD", "ALAB", "FLY"], dca: 60, dcaNote: "$60/week, Mondays" },
  dad: { label: "Dad", sub: "Fidelity", holdings: ["NVDA", "NBIS", "MU", "AMD", "SNDK", "CRDO", "APLD", "ALAB"], dca: 50, dcaNote: "$50/month" },
  bro: { label: "Bro", sub: "Robinhood", holdings: ["NVDA", "NBIS", "MU", "AMD", "SNDK", "CRDO", "APLD", "ALAB"], dca: 0, dcaNote: "no DCA" },
};

const AGENTS = [
  { id: "technical", name: "Technical Analyst", role: "Sell Protocol + 4-Gate chart check", icon: Activity, accent: "#38e0d4", search: true,
    system: `You are the TECHNICAL ANALYST on an investment council. ${PROTOCOLS}
Your ONLY job: judge the chart for the given ticker. Search the web for recent price action, weekly trend, key levels. Is the weekly in an uptrend? Are red candles forming into a confirmed downtrend? Where is support/resistance?
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words max>","points":["<short>","<short>","<short>"]}` },
  { id: "catalyst", name: "Catalyst Scout", role: "Catalyst within 60 days?", icon: Telescope, accent: "#f5c451", search: true,
    system: `You are the CATALYST SCOUT on an investment council. ${PROTOCOLS}
Your ONLY job: find whether the ticker has a hard catalyst within 60 days (earnings, launch, regulatory, guidance). Search for the next earnings date. State the bull thesis in one line.
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10>,"headline":"<8 words max>","points":["<catalyst + date>","<bull thesis>","<short>"]}` },
  { id: "risk", name: "Risk Manager", role: "Sizing, concentration, dilution", icon: Shield, accent: "#5b9dff", search: true,
    system: `You are the RISK MANAGER on an investment council. ${PROTOCOLS}
Your ONLY job: assess risk of ADDING this ticker to the account described in the prompt. Concerns: concentration vs the account's existing holdings, dilution/share-count flags (search for recent secondaries/heavy SBC), beta/volatility, suggested starter size.
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10 where 10=low risk>,"headline":"<8 words max>","points":["<concentration take>","<dilution/vol flag>","<sizing rec>"]}` },
  { id: "macro", name: "Macro Agent", role: "Headwind-day check (Gate 4)", icon: Globe, accent: "#b083ff", search: true,
    system: `You are the MACRO AGENT on an investment council. ${PROTOCOLS}
Your ONLY job: judge today's macro tape for Gate 4. Search for TODAY's conditions: Fed/rates, CPI, oil, Iran/Middle East, semiconductor tone. Is today a macro headwind day where new entries should pause?
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10 where 10=clear skies>,"headline":"<8 words max>","points":["<rates/CPI>","<oil/geopolitics>","<sector tone>"]}` },
  { id: "bear", name: "Devil's Advocate", role: "Forced to argue AGAINST", icon: Swords, accent: "#ff5d6c", search: true,
    system: `You are the DEVIL'S ADVOCATE on an investment council. ${PROTOCOLS}
Your ONLY job: build the strongest BEAR case against buying this ticker now. Search for risks, bear theses, valuation concerns, competitive threats, downgrades. Be sharp and specific.
Respond ONLY with JSON in a \`\`\`json block: {"stance":"BEARISH","score":<0-10 strength-of-bear-case>,"headline":"<8 words max>","points":["<bear>","<bear>","<bear>"]}` },
  { id: "sizer", name: "Position Sizer", role: "Turns the call into dollars + shares", icon: Wallet, accent: "#7ee787", search: true,
    system: `You are the POSITION SIZER on an investment council. ${PROTOCOLS}
Your ONLY job: translate the decision into concrete numbers for the stated available capital and account. Search for the ticker's CURRENT share price. Compute a small starter dollar amount, approximate shares at current price, and % of available capital. If no capital stated, give % guidance. Keep starters genuinely small.
Respond ONLY with JSON in a \`\`\`json block: {"stance":"PASS"|"FAIL"|"CAUTION","score":<0-10 where 10=fits cleanly>,"headline":"<8 words max>","points":["<starter $ + approx shares>","<% of available capital>","<scale-up plan>"]}` },
];

const STANCE_STYLE = {
  PASS: { bg: "rgba(56,224,138,0.12)", fg: "#38e08a", label: "PASS" },
  FAIL: { bg: "rgba(255,93,108,0.12)", fg: "#ff5d6c", label: "FAIL" },
  CAUTION: { bg: "rgba(245,196,81,0.12)", fg: "#f5c451", label: "CAUTION" },
  BEARISH: { bg: "rgba(255,93,108,0.12)", fg: "#ff5d6c", label: "BEAR CASE" },
  BUY: { bg: "rgba(56,224,138,0.14)", fg: "#38e08a", label: "BUY" },
  WATCH: { bg: "rgba(245,196,81,0.14)", fg: "#f5c451", label: "WATCH" },
  PASS_FINAL: { bg: "rgba(255,93,108,0.14)", fg: "#ff5d6c", label: "PASS" },
};
const WD_STYLE = {
  HOLD: { bg: "rgba(56,224,138,0.12)", fg: "#38e08a", icon: Check, label: "HOLD" },
  WATCH: { bg: "rgba(245,196,81,0.12)", fg: "#f5c451", icon: Eye, label: "WATCH" },
  SELL: { bg: "rgba(255,93,108,0.14)", fg: "#ff5d6c", icon: X, label: "SELL SIGNAL" },
};

// ---- Demo data ----
const DEMO_TICKER = "AAPL";
const DEMO_RESULTS = {
  technical: { stance: "CAUTION", score: 6, headline: "Uptrend intact, momentum cooling", points: ["Weekly still higher-highs/higher-lows", "Stalling under recent resistance", "No confirmed downtrend - HOLD logic"] },
  catalyst: { stance: "PASS", score: 7, headline: "Earnings + WWDC inside 60 days", points: ["Next earnings ~late July (in window)", "AI/Siri refresh is the thesis", "Services growth still the engine"] },
  risk: { stance: "PASS", score: 8, headline: "Actually diversifies your book", points: ["Outside your ~80% AI-infra cluster", "Low beta, clean balance sheet", "Starter: 3-5% of new capital"] },
  macro: { stance: "CAUTION", score: 5, headline: "CPI midweek, choppy tape", points: ["Rate-hike odds elevated post-jobs", "Oil firm on Middle East risk", "Mega-cap holds up better than high-beta"] },
  bear: { stance: "BEARISH", score: 6, headline: "Growth premium, thin catalysts", points: ["Hardware revenue near-flat", "China demand + regulatory overhang", "Priced for an AI win not yet shipped"] },
  sizer: { stance: "CAUTION", score: 6, headline: "Starter only - keep powder dry", points: ["Starter ~$80-100 (approx 0.4 sh @ ~$205)", "approx 4-5% of your $2,000 available", "Scale toward ~10% after weekly confirms"] },
};
const DEMO_SYNTH = { verdict: "WATCH", conviction: 6, sizing: "Starter 3-5% only; add after CPI clears", summary: "AAPL is a quality, lower-risk name that would diversify your AI-heavy book - but conviction lands at 6, under your 7 threshold, and CPI midweek is a macro headwind. Gates 3 and 4 aren't cleanly passed. Watch it, don't chase it.", bull: ["Diversifies concentration risk", "Catalyst window is open"], risks: ["Conviction below 7-gate", "Macro headwind day (CPI)"] };
const DEMO_DCA = { allocations: [ { ticker: "AMD", amount: 35, pct: 58, reason: "Hardest hit Friday (-10.9%), sitting on 20-day support, weekly uptrend intact" }, { ticker: "MU", amount: 25, pct: 42, reason: "HBM4 catalyst locked, oversold after -13% but thesis unchanged" } ], summary: "Concentrating this week's $60 into the two best dips rather than spreading thin across 9 names. Both still in weekly uptrends - buying weakness, not catching knives. Skipped FLY (tripping sell protocol)." };
const DEMO_WD = [
  { ticker: "NVDA", status: "HOLD", note: "Higher highs intact; one red week is not a trend" },
  { ticker: "NBIS", status: "HOLD", note: "Parabolic but structure unbroken; high beta" },
  { ticker: "MU", status: "HOLD", note: "Sharp pullback, weekly uptrend still up" },
  { ticker: "AMD", status: "HOLD", note: "Near 20-day support, no lower low yet" },
  { ticker: "SNDK", status: "WATCH", note: "Parabolic - watch for first weekly lower high" },
  { ticker: "CRDO", status: "HOLD", note: "Relative strength, barely dipped in selloff" },
  { ticker: "APLD", status: "WATCH", note: "Volatile; testing support, not broken" },
  { ticker: "ALAB", status: "HOLD", note: "Off ATH but uptrend intact" },
  { ticker: "FLY", status: "SELL", note: "Lower highs/lower lows since IPO peak, below secondary price - protocol tripped" },
];

function extractJSON(text) {
  if (!text) return null;
  let m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  let c = m ? m[1] : null;
  if (!c) { const f = text.indexOf("{"); const l = text.lastIndexOf("}"); if (f !== -1 && l > f) c = text.slice(f, l + 1); }
  if (!c) return null;
  try { return JSON.parse(c.trim()); } catch { return null; }
}
async function callAgent(system, userContent, useSearch) {
  const body = { model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages: [{ role: "user", content: userContent }] };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("api_unreachable_" + res.status);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

const MONO = { fontFamily: "'IBM Plex Mono', monospace" };
const DISP = { fontFamily: "'Chakra Petch', sans-serif" };
const CY = "#3fe0ff";

function ArcReactor({ size = 30 }) {
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: `drop-shadow(0 0 ${size / 6}px rgba(63,224,255,0.7))` }}>
      <circle className="spin-slow" cx="50" cy="50" r="45" fill="none" stroke={CY} strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="5 6" />
      <circle className="spin-rev" cx="50" cy="50" r="35" fill="none" stroke={CY} strokeOpacity="0.7" strokeWidth="2" strokeDasharray="22 9" />
      <circle cx="50" cy="50" r="24" fill="none" stroke={CY} strokeOpacity="0.35" strokeWidth="1" />
      {spokes.map((a) => (
        <line key={a} x1={50 + 12 * Math.cos((a * Math.PI) / 180)} y1={50 + 12 * Math.sin((a * Math.PI) / 180)} x2={50 + 23 * Math.cos((a * Math.PI) / 180)} y2={50 + 23 * Math.sin((a * Math.PI) / 180)} stroke={CY} strokeOpacity="0.45" strokeWidth="1.2" />
      ))}
      <circle className="core-pulse" cx="50" cy="50" r="12" fill={CY} fillOpacity="0.85" />
      <circle cx="50" cy="50" r="12" fill="none" stroke="#cdf6ff" strokeWidth="1.6" />
    </svg>
  );
}

export default function CouncilDashboard() {
  const [account, setAccount] = useState("edwin");
  const [tab, setTab] = useState("chat");

  // PM Chat + voice state
  const [chat, setChat] = useState([{ role: "pm", text: "Good to see you, sir. The council stands ready. Ask me how a holding looks, or say \u201cshould I buy \u2014\u201d and I\u2019ll convene the agents." }]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voicesRef = useRef([]);
  const recogRef = useRef(null);
  const chatEndRef = useRef(null);
  const [apiDown, setApiDown] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const flagApiDown = () => setApiDown(true);

  // Council state
  const [ticker, setTicker] = useState("");
  const [capital, setCapital] = useState("");
  const [active, setActive] = useState(null);
  const [agentState, setAgentState] = useState({});
  const [synthesis, setSynthesis] = useState({ status: "idle", result: null });
  const [running, setRunning] = useState(false);
  const synthRef = useRef(null);

  // DCA state
  const [dcaAmount, setDcaAmount] = useState("");
  const [dca, setDca] = useState({ status: "idle", result: null });

  // Watchdog state
  const [wd, setWd] = useState({});
  const [wdRunning, setWdRunning] = useState(false);
  const [wdRan, setWdRan] = useState(false);

  // Positions (shares + avg cost) per account — the council reads these
  const [positions, setPositions] = useState(() => {
    const o = {};
    Object.entries(ACCOUNTS).forEach(([k, a]) => { o[k] = {}; a.holdings.forEach((t) => (o[k][t] = { shares: "", cost: "" })); });
    return o;
  });
  const [newTicker, setNewTicker] = useState("");

  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
      * { -webkit-tap-highlight-color: transparent; }
      @keyframes cardIn { from { opacity:0; transform: translateY(14px) scale(.98);} to {opacity:1; transform:none;} }
      @keyframes scan { 0%{ transform: translateY(-100%);} 100%{ transform: translateY(400%);} }
      @keyframes gridmove { from{ background-position:0 0;} to{ background-position:44px 44px;} }
      @keyframes bootIn { from { opacity:0; transform: translateY(-10px);} to {opacity:1; transform:none;} }
      @keyframes glowPulse { 0%,100%{ box-shadow:0 0 13px rgba(245,196,81,0.28);} 50%{ box-shadow:0 0 28px rgba(245,196,81,0.55);} }
      @keyframes neon { 0%,100%{ text-shadow:0 0 8px rgba(245,196,81,0.35),0 0 22px rgba(245,196,81,0.16);} 50%{ text-shadow:0 0 15px rgba(245,196,81,0.6),0 0 36px rgba(245,196,81,0.32);} }
      @keyframes sheen { 0%{ transform: translateX(-140%) skewX(-18deg);} 60%,100%{ transform: translateX(260%) skewX(-18deg);} }
      @keyframes blink { 0%,100%{ opacity:1;} 50%{ opacity:.2;} }
      @keyframes crt { 0%{ transform: translateY(-15%);} 100%{ transform: translateY(115%);} }
      @keyframes orb { 0%,100%{ transform: translate(0,0) scale(1); opacity:.5;} 50%{ transform: translate(20px,-16px) scale(1.12); opacity:.8;} }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes spinRev { to { transform: rotate(-360deg); } }
      @keyframes corePulse { 0%,100%{ opacity:.65; transform:scale(1);} 50%{ opacity:1; transform:scale(1.14);} }
      @keyframes bootFade { 0%,72%{ opacity:1;} 100%{ opacity:0; visibility:hidden;} }
      @keyframes bootText { from{ clip-path: inset(0 100% 0 0);} to{ clip-path: inset(0 0 0 0);} }
      @keyframes ringExpand { 0%{ transform:scale(.6); opacity:.6;} 100%{ transform:scale(1.5); opacity:0;} }
      .spin-slow { animation: spin 16s linear infinite; transform-box: fill-box; transform-origin:center; }
      .spin-rev { animation: spinRev 10s linear infinite; transform-box: fill-box; transform-origin:center; }
      .core-pulse { animation: corePulse 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin:center; }
      .scanline { animation: scan 1.6s linear infinite; }
      .boot { animation: bootIn .6s cubic-bezier(.2,.7,.2,1) both; }
      .neon { animation: neon 3.6s ease-in-out infinite; }
      .blink { animation: blink 1.4s ease-in-out infinite; }
      .lift { transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
      @media (hover:hover){ .lift:hover { transform: translateY(-3px); box-shadow: 0 10px 34px rgba(0,0,0,0.45); } }
      .glow-btn { position: relative; overflow: hidden; }
      .glow-btn:not(:disabled) { animation: glowPulse 2.6s ease-in-out infinite; }
      .glow-btn::after { content:''; position:absolute; top:-50%; bottom:-50%; left:0; width:36%; background: linear-gradient(100deg, transparent, rgba(255,255,255,0.5), transparent); transform: translateX(-140%) skewX(-18deg); }
      @media (hover:hover){ .glow-btn:not(:disabled):hover::after { animation: sheen 1.05s ease; } }
      .hud::before, .hud::after { content:''; position:absolute; width:11px; height:11px; pointer-events:none; opacity:.45; }
      .hud::before { top:6px; left:6px; border-top:1.5px solid currentColor; border-left:1.5px solid currentColor; }
      .hud::after { bottom:6px; right:6px; border-bottom:1.5px solid currentColor; border-right:1.5px solid currentColor; }
      .orb { animation: orb 9s ease-in-out infinite; }
      .crtline { position:fixed; left:0; right:0; top:0; height:140px; background:linear-gradient(rgba(120,231,135,0.03), transparent); animation: crt 8s linear infinite; pointer-events:none; z-index:30; mix-blend-mode:screen; }
      .no-scrollbar::-webkit-scrollbar { display:none; }
      .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
      @media (prefers-reduced-motion: reduce){ .scanline,.neon,.glow-btn,.blink,.crtline,.boot,.orb,.spin-slow,.spin-rev,.core-pulse { animation:none !important; } }
    `;
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  // Load TTS voices
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load(); window.speechSynthesis.onvoiceschanged = load;
  }, []);
  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  const srSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  function pickVoice() {
    const vs = voicesRef.current || [];
    return vs.find((v) => /en-GB/i.test(v.lang) && /daniel|arthur|male|uk english male/i.test(v.name))
      || vs.find((v) => /Google UK English Male/i.test(v.name))
      || vs.find((v) => /en-GB/i.test(v.lang))
      || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs[0];
  }
  function speak(text) {
    if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = 1.0; u.pitch = 0.82; setSpeaking(true);
    u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }
  function stopSpeaking() { if (window.speechSynthesis) window.speechSynthesis.cancel(); setSpeaking(false); }
  function toggleVoice() { setVoiceOn((p) => { if (p) stopSpeaking(); return !p; }); }
  function toggleListen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    if (listening) { recogRef.current && recogRef.current.stop(); setListening(false); return; }
    const r = new SR(); recogRef.current = r; r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { const t = e.results[0][0].transcript; setListening(false); sendChat(t); };
    r.onerror = () => setListening(false); r.onend = () => setListening(false);
    setListening(true); try { r.start(); } catch { setListening(false); }
  }

  async function sendChat(raw) {
    const text = (typeof raw === "string" ? raw : chatInput).trim();
    if (!text || chatBusy) return;
    setChatInput(""); stopSpeaking();
    setChat((p) => [...p, { role: "user", text }]);
    setChatBusy(true);
    const a = ACCOUNTS[account];
    const acctLine = `Active account: ${a.label}'s (${a.sub}); current positions: ${positionsLine}; DCA ${a.dcaNote}.`;
    const pmSys = `You are the PORTFOLIO MANAGER, head of THE COUNCIL - a JARVIS-style AI investing assistant. ${PROTOCOLS} ${acctLine}
Tone: sharp, confident, concise, lightly British-butler; address the investor as "sir" occasionally (not every line). You command 5 specialists: Technical, Catalyst, Risk, Macro, Devil's Advocate, Position Sizer.
DECIDE: if the investor asks whether to BUY / enter / add / review / decide on a SPECIFIC ticker, set convene=true and the ticker - you will consult the council. For anything else (how a holding looks, market reads, general questions), answer directly and concisely; be honest if unsure.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<1-3 sentence reply>","convene":<true|false>,"ticker":"<TICKER or null>"}`;
    let router;
    try { const txt = await callAgent(pmSys, `Investor says: "${text}". Today is ${new Date().toDateString()}. Return ONLY the JSON.`, true);
      router = extractJSON(txt) || { speak: "Apologies sir, I didn't quite catch that.", convene: false, ticker: null };
    } catch { flagApiDown(); router = { speak: "I can't reach the council from here, sir \u2014 live mode is blocked in this viewer. Open on desktop, or tap a DEMO button to see me work.", convene: false, ticker: null }; }

    if (router.convene && router.ticker) {
      const tkr = String(router.ticker).toUpperCase();
      const intro = router.speak || `Consulting the council on ${tkr}, sir.`;
      setChat((p) => [...p, { role: "pm", text: intro }]); speak(intro);
      const runId = Date.now();
      setChat((p) => [...p, { role: "council", runId, ticker: tkr, agents: {} }]);
      const userContent = `Ticker: ${tkr}. The investor is considering BUYING it. ${acctLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.`;
      const results = {};
      await Promise.all(AGENTS.map(async (ag) => {
        try { const txt = await callAgent(ag.system, userContent, ag.search); const pr = extractJSON(txt);
          results[ag.id] = pr || { stance: "CAUTION" };
        } catch { flagApiDown(); results[ag.id] = { stance: "CAUTION" }; }
        setChat((p) => p.map((m) => m.runId === runId ? { ...m, agents: { ...m.agents, [ag.id]: results[ag.id].stance } } : m));
      }));
      const council = AGENTS.map((ag) => `${ag.name}: ${JSON.stringify(results[ag.id])}`).join("\n");
      const synthSys = `You are the PM concluding the council on ${tkr} for ${a.label}. ${PROTOCOLS}
Speak the ruling to the investor conversationally (JARVIS tone, 2-4 sentences): the verdict, conviction out of 10, the single most important factor, and sizing if buying. Reference that the agents reported in.
Respond ONLY with JSON in a \`\`\`json block: {"speak":"<the spoken ruling>","verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>}`;
      let synth;
      try { const txt = await callAgent(synthSys, `Council reports on ${tkr}:\n${council}\n\nDeliver the ruling. Return ONLY the JSON.`, false);
        synth = extractJSON(txt) || { speak: "The council is split, sir - I'd hold off for now.", verdict: "WATCH", conviction: 5 };
      } catch { synth = { speak: "I couldn't finalize the ruling, sir.", verdict: "WATCH", conviction: 5 }; }
      setChat((p) => [...p, { role: "pm", text: synth.speak, verdict: synth.verdict, conviction: synth.conviction }]); speak(synth.speak);
    } else {
      setChat((p) => [...p, { role: "pm", text: router.speak }]); speak(router.speak);
    }
    setChatBusy(false);
  }

  const acct = ACCOUNTS[account];
  const posMap = positions[account] || {};
  const acctHoldings = Object.keys(posMap).length ? Object.keys(posMap) : acct.holdings;
  const positionsLine = acctHoldings.map((t) => { const p = posMap[t] || {}; return p.shares ? `${t} ${p.shares}sh${p.cost ? ` @ $${p.cost} avg` : ""}` : t; }).join(", ");
  const setPos = (tkr, field, val) => setPositions((prev) => ({ ...prev, [account]: { ...prev[account], [tkr]: { ...(prev[account]?.[tkr] || { shares: "", cost: "" }), [field]: val } } }));
  const addTicker = () => { const t = newTicker.trim().toUpperCase(); if (!t) return; setPositions((prev) => ({ ...prev, [account]: { ...prev[account], [t]: prev[account]?.[t] || { shares: "", cost: "" } } })); setNewTicker(""); };
  const removeTicker = (t) => setPositions((prev) => { const next = { ...prev[account] }; delete next[t]; return { ...prev, [account]: next }; });
  const quickPicks = ["AAPL", "TSLA", "OKLO", "PLTR", "AVGO", "SMCI"];

  // ---------- COUNCIL ----------
  async function convene() {
    const t = ticker.trim().toUpperCase();
    if (!t || running) return;
    setActive(t); setRunning(true); setSynthesis({ status: "idle", result: null });
    const init = {}; AGENTS.forEach((a) => (init[a.id] = { status: "running", result: null })); setAgentState(init);
    const acctLine = `Account under review: ${acct.label}'s (${acct.sub}). This account currently holds: ${positionsLine}. DCA: ${acct.dcaNote}. Judge concentration and sizing against THIS account and its actual share positions.`;
    const capLine = capital.trim() ? `Available capital to deploy: $${capital.trim()}.` : `Available capital not specified.`;
    const userContent = `Ticker under consideration: ${t}. The investor is thinking about BUYING it. ${acctLine} ${capLine} Today is ${new Date().toDateString()}. Return ONLY the JSON.`;
    const results = {};
    await Promise.all(AGENTS.map(async (a) => {
      try { const txt = await callAgent(a.system, userContent, a.search); const p = extractJSON(txt);
        results[a.id] = p || { stance: "CAUTION", headline: "Could not parse output", points: ["Agent returned unstructured data."], score: 5 };
        setAgentState((prev) => ({ ...prev, [a.id]: { status: "done", result: results[a.id] } }));
      } catch { flagApiDown(); results[a.id] = null; setAgentState((prev) => ({ ...prev, [a.id]: { status: "error", result: null } })); }
    }));
    setSynthesis({ status: "running", result: null });
    setTimeout(() => synthRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    const council = AGENTS.map((a) => `${a.name} (${a.role}): ${JSON.stringify(results[a.id])}`).join("\n");
    const synthSystem = `You are the PORTFOLIO MANAGER and final decision-maker. ${PROTOCOLS}
Five specialists weighed in. Weigh against the 4-Gate Rule. BUY requires gates broadly satisfied AND conviction >= 7. If macro is a headwind day, downgrade to WATCH. Respect a strong unrebutted bear case.
Respond ONLY with JSON in a \`\`\`json block: {"verdict":"BUY"|"WATCH"|"PASS","conviction":<0-10>,"sizing":"<one line>","summary":"<2-3 sentences, plain, direct>","bull":["<for>","<for>"],"risks":["<risk>","<risk>"]}`;
    try { const txt = await callAgent(synthSystem, `Council inputs for ${t}:\n${council}\n\n${acctLine}\n${capLine}\n\nFinal ruling. Return ONLY the JSON.`, false);
      const p = extractJSON(txt); setSynthesis({ status: "done", result: p || { verdict: "WATCH", conviction: 5, sizing: "n/a", summary: "Could not parse synthesis.", bull: [], risks: [] } });
    } catch { flagApiDown(); setSynthesis({ status: "error", result: null }); }
    setRunning(false);
  }
  async function runDemo() {
    if (running) return;
    setTicker(DEMO_TICKER); setCapital("2000"); setActive(DEMO_TICKER); setRunning(true); setSynthesis({ status: "idle", result: null });
    const init = {}; AGENTS.forEach((a) => (init[a.id] = { status: "running", result: null })); setAgentState(init);
    const order = ["risk", "catalyst", "technical", "macro", "bear", "sizer"];
    order.forEach((id, i) => setTimeout(() => setAgentState((prev) => ({ ...prev, [id]: { status: "done", result: DEMO_RESULTS[id] } })), 700 + i * 600));
    const total = 700 + order.length * 600;
    setTimeout(() => { setSynthesis({ status: "running", result: null }); synthRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, total + 200);
    setTimeout(() => { setSynthesis({ status: "done", result: DEMO_SYNTH }); setRunning(false); }, total + 1500);
  }

  // ---------- DCA ----------
  async function allocateDCA() {
    if (dca.status === "running") return;
    const amt = (dcaAmount.trim() ? Number(dcaAmount) : acct.dca) || 0;
    if (!amt) { setDca({ status: "done", result: { allocations: [], summary: "No DCA amount set for this account. Enter an amount above to allocate." } }); return; }
    setDca({ status: "running", result: null });
    const sys = `You are the DCA ALLOCATOR. ${PROTOCOLS}
The investor makes a recurring DCA buy into the ${acct.label} account (current positions: ${positionsLine}). Available this round: $${amt}. Search recent price action for these holdings and allocate the dollars toward the 1-2 best "buy the dip" setups - most oversold / closest to weekly support while still in an uptrend. Concentrate, don't spread thin. NEVER add to a name tripping the sell protocol (note it if so).
Respond ONLY with JSON in a \`\`\`json block: {"allocations":[{"ticker":"X","amount":<dollars>,"pct":<0-100>,"reason":"<one line>"}],"summary":"<2 sentences>"}`;
    try { const txt = await callAgent(sys, `Allocate this round's $${amt} for ${acct.label}. Today is ${new Date().toDateString()}. Return ONLY the JSON.`, true);
      const p = extractJSON(txt); setDca({ status: "done", result: p || { allocations: [], summary: "Could not parse allocation." } });
    } catch { flagApiDown(); setDca({ status: "error", result: null }); }
  }
  function runDCADemo() { setAccount("edwin"); setDcaAmount("60"); setDca({ status: "running", result: null }); setTimeout(() => setDca({ status: "done", result: DEMO_DCA }), 1400); }

  // ---------- WATCHDOG ----------
  async function scanWatchdog() {
    if (wdRunning) return;
    setWdRunning(true); setWdRan(true);
    const init = {}; acctHoldings.forEach((h) => (init[h] = { status: "running" })); setWd(init);
    const sys = `You are the SELL-PROTOCOL WATCHDOG. ${PROTOCOLS}
Check ONE holding against the SELL PROTOCOL: a SELL signal requires red candles forming AND a confirmed weekly downtrend (lower highs / lower lows). Otherwise HOLD. Use WATCH if weakening but not yet confirmed. Search recent weekly price action.
Respond ONLY with JSON in a \`\`\`json block: {"status":"HOLD"|"WATCH"|"SELL","note":"<one-line weekly read>"}`;
    await Promise.all(acctHoldings.map(async (h) => {
      try { const txt = await callAgent(sys, `Holding: ${h}. Today is ${new Date().toDateString()}. Check it against the sell protocol. Return ONLY the JSON.`, true);
        const p = extractJSON(txt); setWd((prev) => ({ ...prev, [h]: { status: "done", result: p || { status: "WATCH", note: "Could not parse." } } }));
      } catch { flagApiDown(); setWd((prev) => ({ ...prev, [h]: { status: "error" } })); }
    }));
    setWdRunning(false);
  }
  function runWatchdogDemo() {
    setWdRan(true); const init = {}; acctHoldings.forEach((h) => (init[h] = { status: "running" })); setWd(init);
    DEMO_WD.filter((d) => acctHoldings.includes(d.ticker)).forEach((d, i) =>
      setTimeout(() => setWd((prev) => ({ ...prev, [d.ticker]: { status: "done", result: { status: d.status, note: d.note } } })), 500 + i * 450));
  }

  const verdictKey = synthesis.result ? (synthesis.result.verdict === "PASS" ? "PASS_FINAL" : synthesis.result.verdict) : null;
  const vStyle = verdictKey ? STANCE_STYLE[verdictKey] : null;
  const wdFlagged = Object.values(wd).filter((x) => x.result && (x.result.status === "SELL")).length;
  const wdWatch = Object.values(wd).filter((x) => x.result && (x.result.status === "WATCH")).length;

  const TABS = [
    { id: "chat", label: "PM CHAT", icon: MessageSquare },
    { id: "council", label: "COUNCIL", icon: Crown },
    { id: "positions", label: "POSITIONS", icon: Briefcase },
    { id: "dca", label: "DCA ALLOCATOR", icon: Coins },
    { id: "watchdog", label: "WATCHDOG", icon: Radar },
    { id: "roadmap", label: "ROADMAP", icon: Map },
  ];

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "#070a0c", color: "#e8eef0", minHeight: "100vh" }} className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: "linear-gradient(rgba(56,224,138,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,224,138,0.04) 1px, transparent 1px)", backgroundSize: "44px 44px", animation: "gridmove 8s linear infinite" }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% -10%, rgba(245,196,81,0.10), transparent 55%)" }} />
      <div className="orb pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(56,224,212,0.10), transparent 70%)", filter: "blur(8px)" }} />
      <div className="orb pointer-events-none absolute top-1/3 -right-24 w-80 h-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(176,131,255,0.09), transparent 70%)", filter: "blur(8px)", animationDelay: "3s" }} />
      <div className="crtline" />

      {/* JARVIS boot sequence */}
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#070a0c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", animation: "bootFade 2s ease forwards", pointerEvents: "none" }}>
        <ArcReactor size={96} />
        <div style={{ ...DISP, color: CY }} className="text-sm tracking-[0.42em] neon">THE COUNCIL</div>
        <div style={{ ...MONO, animation: "bootText 1.3s steps(30) forwards" }} className="text-white/45 text-[10px] tracking-[0.22em] overflow-hidden whitespace-nowrap">CALIBRATING 6 AGENTS · LOADING PROTOCOLS · ONLINE</div>
      </div>

      {/* HUD cockpit frame */}
      <div className="pointer-events-none fixed inset-0 z-20">
        {[["top-3 left-3", "borderTop borderLeft"], ["top-3 right-3", "borderTop borderRight"], ["bottom-3 left-3", "borderBottom borderLeft"], ["bottom-3 right-3", "borderBottom borderRight"]].map(([pos], i) => (
          <div key={i} className={`absolute ${pos} w-6 h-6`} style={{
            borderTop: i < 2 ? `1.5px solid ${CY}` : "none", borderBottom: i >= 2 ? `1.5px solid ${CY}` : "none",
            borderLeft: i % 2 === 0 ? `1.5px solid ${CY}` : "none", borderRight: i % 2 === 1 ? `1.5px solid ${CY}` : "none",
            opacity: 0.4, filter: `drop-shadow(0 0 4px ${CY})`,
          }} />
        ))}
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
        {/* Header */}
        <div className="boot flex items-center justify-between flex-wrap gap-3 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-3"><ArcReactor size={32} /><h1 style={{ ...DISP, letterSpacing: "0.06em" }} className="neon text-2xl sm:text-3xl font-bold">THE COUNCIL</h1></div>
            <p style={{ ...MONO, color: CY }} className="text-[11px] sm:text-xs opacity-70 mt-1 tracking-[0.2em]">J.A.R.V.I.S. // MULTI-AGENT COMMAND DECK</p>
          </div>
          <div style={MONO} className="text-[10px] text-white/40 text-right leading-relaxed">
            <div className="flex items-center justify-end gap-1.5"><span className="blink inline-block w-1.5 h-1.5 rounded-full" style={{ background: CY, boxShadow: `0 0 8px ${CY}` }} /> ONLINE</div>
            <div>SELL-PROTOCOL · 4-GATE ENGINE</div><div className="text-white/25">6-AGENT COUNCIL</div>
          </div>
        </div>

        {/* API-unreachable notice */}
        {apiDown && !noticeDismissed && (
          <div className="mt-4 rounded-xl p-3.5 flex items-start gap-3" style={{ background: "rgba(63,224,255,0.08)", border: `1px solid ${CY}44`, animation: "cardIn .4s ease both" }}>
            <AlertTriangle size={16} style={{ color: CY }} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div style={{ ...DISP, color: CY }} className="text-sm font-semibold">Live mode is blocked in this viewer</div>
              <p className="text-[12px] text-white/65 leading-relaxed mt-0.5">The in-app AI can't run inside the Claude mobile app. Open this on <span className="text-white/90">claude.ai in desktop Chrome</span> for the full live PM, council, and voice \u2014 or tap any <span style={{ color: CY }}>DEMO</span> button to see the flow right now.</p>
            </div>
            <button onClick={() => setNoticeDismissed(true)} className="shrink-0 text-white/40 hover:text-white/80 transition-colors"><X size={15} /></button>
          </div>
        )}

        {/* Account selector (global) */}
        <div className="boot mt-6" style={{ animationDelay: ".08s" }}>
          <label style={MONO} className="text-[11px] text-white/50 tracking-widest">ACTIVE ACCOUNT</label>
          <div className="mt-2 flex gap-2 flex-wrap">
            {Object.entries(ACCOUNTS).map(([key, a]) => {
              const sel = account === key;
              return (
                <button key={key} onClick={() => setAccount(key)} disabled={running || wdRunning}
                  style={{ ...DISP, borderColor: sel ? "#f5c451" : "rgba(255,255,255,0.12)", background: sel ? "rgba(245,196,81,0.12)" : "transparent", color: sel ? "#f5c451" : "rgba(255,255,255,0.6)", boxShadow: sel ? "0 0 16px rgba(245,196,81,0.25)" : "none" }}
                  className="lift px-4 py-2 rounded-lg border text-sm font-semibold transition-all disabled:opacity-40 text-left leading-tight">
                  {a.label}<span style={MONO} className="block text-[9px] opacity-60 font-normal">{a.sub} · {(Object.keys(positions[key] || {}).length || a.holdings.length)} holds · {a.dcaNote}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="boot mt-6 flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10 w-full sm:w-fit overflow-x-auto no-scrollbar" style={{ animationDelay: ".16s" }}>
          {TABS.map((t) => { const Icon = t.icon; const sel = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ ...DISP, background: sel ? "#f5c451" : "transparent", color: sel ? "#0a0a0a" : "rgba(255,255,255,0.55)", boxShadow: sel ? "0 0 18px rgba(245,196,81,0.4)" : "none" }}
                className="flex-shrink-0 px-3 sm:px-4 py-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap"><Icon size={13} /> {t.label}</button>
            );
          })}
        </div>

        {/* ============ PM CHAT TAB ============ */}
        {tab === "chat" && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} style={{ color: CY }} />
                <span style={{ ...DISP, letterSpacing: "0.04em" }} className="text-sm font-semibold">TALK TO YOUR PM · {acct.label.toUpperCase()}</span>
              </div>
              <button onClick={toggleVoice} title={voiceOn ? "Voice on" : "Voice off"}
                style={{ borderColor: voiceOn ? `${CY}66` : "rgba(255,255,255,0.15)", color: voiceOn ? CY : "rgba(255,255,255,0.5)" }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] transition-colors" >
                {voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />}<span style={MONO}>{voiceOn ? "VOICE ON" : "MUTED"}</span>
              </button>
            </div>

            <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden flex flex-col" style={{ height: "min(60vh, 560px)" }}>
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
                {chat.map((m, i) => {
                  if (m.role === "user") return (
                    <div key={i} className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13px]" style={{ background: "rgba(245,196,81,0.14)", border: "1px solid rgba(245,196,81,0.3)" }}>{m.text}</div></div>
                  );
                  if (m.role === "pm") { const vs = m.verdict ? STANCE_STYLE[m.verdict === "PASS" ? "PASS_FINAL" : m.verdict] : null;
                    return (
                      <div key={i} className="flex justify-start gap-2.5" style={{ animation: "cardIn .4s ease both" }}>
                        <div className="shrink-0 mt-0.5"><ArcReactor size={26} /></div>
                        <div className="max-w-[82%]">
                          <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] text-white/85" style={{ background: "rgba(63,224,255,0.07)", border: "1px solid rgba(63,224,255,0.22)" }}>
                            {speaking && i === chat.length - 1 && voiceOn && <span className="inline-flex items-center gap-1 mr-1.5 align-middle"><span className="blink inline-block w-1.5 h-1.5 rounded-full" style={{ background: CY }} /></span>}
                            {m.text}
                          </div>
                          {vs && <div className="mt-1.5 inline-flex items-center gap-2"><span style={{ ...MONO, background: vs.bg, color: vs.fg }} className="text-[9px] font-semibold px-2 py-0.5 rounded">{vs.label}</span><span style={MONO} className="text-[9px] text-white/40">{m.conviction}/10 · {m.ticker || ""}</span></div>}
                        </div>
                      </div>
                    );
                  }
                  if (m.role === "council") return (
                    <div key={i} className="flex justify-start gap-2.5"><div className="shrink-0 w-[26px]" />
                      <div className="max-w-[88%] w-full rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={MONO} className="text-[9px] text-white/40 tracking-widest mb-2">CONSULTING THE COUNCIL · {m.ticker}</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {AGENTS.map((ag) => { const stance = m.agents[ag.id]; const ss = stance && STANCE_STYLE[stance];
                            return (
                              <div key={ag.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${stance ? ag.accent + "33" : "rgba(255,255,255,0.06)"}` }}>
                                <ag.icon size={11} style={{ color: ag.accent }} />
                                <span style={MONO} className="text-[9px] text-white/55 truncate flex-1">{ag.name.split(" ")[0]}</span>
                                {stance ? <span style={{ ...MONO, color: ss ? ss.fg : "#fff" }} className="text-[8px] font-bold">{ss ? ss.label : stance}</span> : <Loader2 size={10} className="animate-spin text-white/30" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                  return null;
                })}
                {chatBusy && <div className="flex justify-start gap-2.5"><div className="shrink-0 mt-0.5"><ArcReactor size={26} /></div><div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5" style={{ background: "rgba(63,224,255,0.07)", border: "1px solid rgba(63,224,255,0.22)" }}><Loader2 size={14} className="animate-spin" style={{ color: CY }} /></div></div>}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-white/10 p-2.5 flex items-center gap-2">
                <button onClick={toggleListen} disabled={!srSupported || chatBusy} title={srSupported ? "Hold a thought - tap to speak" : "Voice input not supported in this browser"}
                  style={{ background: listening ? "#ff5d6c" : "rgba(255,255,255,0.05)", borderColor: listening ? "#ff5d6c" : "rgba(255,255,255,0.15)", color: listening ? "#fff" : srSupported ? CY : "rgba(255,255,255,0.3)" }}
                  className={`shrink-0 rounded-xl border w-11 h-11 flex items-center justify-center transition-all disabled:opacity-40 ${listening ? "glow-btn" : ""}`}>
                  {listening ? <Mic size={18} /> : srSupported ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} disabled={chatBusy}
                  placeholder={listening ? "Listening\u2026" : "Ask your PM anything\u2026"} style={MONO}
                  className="flex-1 bg-white/[0.04] border border-white/15 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-[#3fe0ff]/60 transition-colors disabled:opacity-50" />
                <button onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()} style={{ background: chatBusy || !chatInput.trim() ? "rgba(63,224,255,0.25)" : CY, color: "#04121a" }}
                  className="glow-btn shrink-0 rounded-xl w-11 h-11 flex items-center justify-center transition-all disabled:cursor-not-allowed"><Send size={17} /></button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["How does CRDO look?", "Should I buy OKLO?", "What's the macro risk today?"].map((q) => (
                <button key={q} onClick={() => sendChat(q)} disabled={chatBusy} style={MONO} className="text-[10px] px-2.5 py-1 rounded-full border border-white/10 text-white/50 hover:border-[#3fe0ff]/50 hover:text-[#3fe0ff] transition-colors disabled:opacity-40">{q}</button>
              ))}
            </div>
            <p style={MONO} className="mt-2 text-[10px] text-white/30">{srSupported ? "Tap the mic to talk, or type. " : "Type to chat (voice input needs Chrome). "}PM replies aloud when voice is on.</p>
          </div>
        )}

        {/* ============ COUNCIL TAB ============ */}
        {tab === "council" && (
          <div className="mt-6">
            <label style={MONO} className="block text-[11px] text-white/50 tracking-widest">ENTER TICKER TO CONVENE THE COUNCIL</label>
            <div className="mt-2 flex gap-2 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 min-w-[180px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={ticker} onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => e.key === "Enter" && convene()} placeholder="e.g. AAPL"
                  style={{ ...MONO, letterSpacing: "0.15em" }} className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-3 text-lg uppercase outline-none focus:border-[#f5c451]/60 transition-colors" />
              </div>
              <button onClick={convene} disabled={running || !ticker.trim()} style={{ ...DISP, letterSpacing: "0.08em", background: running || !ticker.trim() ? "rgba(245,196,81,0.25)" : "#f5c451", color: "#0a0a0a" }}
                className="glow-btn w-full sm:w-auto px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:cursor-not-allowed transition-all hover:brightness-110 whitespace-nowrap">
                {running ? <><Loader2 size={18} className="animate-spin" /> CONVENING…</> : <>CONVENE <ChevronRight size={18} /></>}
              </button>
            </div>
            <div className="mt-2 flex gap-2 items-center">
              <div className="relative flex-1"><Wallet size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={capital} onChange={(e) => setCapital(e.target.value.replace(/[^0-9.]/g, ""))} onKeyDown={(e) => e.key === "Enter" && convene()} inputMode="decimal" placeholder="available capital (optional)"
                  style={MONO} className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#7ee787]/60 transition-colors" />
                {capital.trim() && <span style={MONO} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#7ee787]">${Number(capital).toLocaleString()}</span>}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span style={MONO} className="text-[10px] text-white/30">QUICK:</span>
              {quickPicks.map((q) => <button key={q} onClick={() => setTicker(q)} disabled={running} style={MONO} className="text-[11px] px-2.5 py-1 rounded border border-white/10 text-white/55 hover:border-[#f5c451]/50 hover:text-[#f5c451] transition-colors disabled:opacity-40">{q}</button>)}
              <button onClick={runDemo} disabled={running} style={MONO} className="ml-auto text-[11px] px-3 py-1 rounded border border-[#38e0d4]/40 text-[#38e0d4] hover:bg-[#38e0d4]/10 transition-colors disabled:opacity-40 flex items-center gap-1.5"><Play size={11} /> SEE DEMO</button>
            </div>

            {active && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3"><div className="h-px flex-1 bg-white/10" /><span style={MONO} className="text-[10px] text-white/40 tracking-widest">COUNCIL REVIEWING {active} · FOR {acct.label.toUpperCase()}</span><div className="h-px flex-1 bg-white/10" /></div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AGENTS.map((a) => { const st = agentState[a.id] || { status: "idle" }; const Icon = a.icon; const r = st.result; const ss = r && STANCE_STYLE[r.stance];
                    return (
                      <div key={a.id} style={{ animation: st.status === "done" ? `cardIn .5s cubic-bezier(.2,.7,.2,1) both` : undefined, borderColor: st.status === "done" ? `${a.accent}40` : "rgba(255,255,255,0.08)" }} className="hud lift relative bg-white/[0.025] border rounded-xl p-4 overflow-hidden">
                        {st.status === "running" && <div className="absolute left-0 right-0 h-12 scanline" style={{ background: `linear-gradient(${a.accent}22, transparent)` }} />}
                        <div className="flex items-start justify-between gap-2 relative">
                          <div className="flex items-center gap-2.5"><div className="rounded-lg p-2" style={{ background: `${a.accent}1a`, border: `1px solid ${a.accent}33` }}><Icon size={16} style={{ color: a.accent }} /></div>
                            <div><div style={DISP} className="text-sm font-semibold leading-tight">{a.name}</div><div style={MONO} className="text-[9px] text-white/35 mt-0.5">{a.role}</div></div></div>
                          {st.status === "done" && ss && <span style={{ ...MONO, background: ss.bg, color: ss.fg }} className="text-[9px] font-semibold px-2 py-1 rounded whitespace-nowrap">{ss.label}</span>}
                        </div>
                        {st.status === "running" && <div className="mt-4 flex items-center gap-2 text-white/40" style={MONO}><Loader2 size={13} className="animate-spin" /><span className="text-[11px]">searching · analyzing…</span></div>}
                        {st.status === "error" && <div className="mt-4 flex items-center gap-2 text-[#ff5d6c]" style={MONO}><AlertTriangle size={13} /><span className="text-[11px]">agent error — retry</span></div>}
                        {st.status === "done" && r && (
                          <div className="mt-3 relative">
                            <div className="flex items-center justify-between gap-2 mb-2"><p className="text-[13px] font-medium leading-snug" style={{ color: a.accent }}>{r.headline}</p>{typeof r.score === "number" && <span style={MONO} className="text-[10px] text-white/40 whitespace-nowrap">{r.score}/10</span>}</div>
                            <ul className="space-y-1.5">{(r.points || []).map((p, j) => <li key={j} className="flex gap-2 text-[12px] text-white/65 leading-snug"><span style={{ color: a.accent }} className="mt-[3px]">▸</span><span>{p}</span></li>)}</ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {active && (
              <div ref={synthRef} className="mt-5">
                {synthesis.status === "running" && <div className="bg-white/[0.025] border border-[#f5c451]/30 rounded-xl p-6 flex items-center gap-3 text-[#f5c451]" style={MONO}><Loader2 size={18} className="animate-spin" /><span className="text-sm">Portfolio Manager synthesizing the council's ruling…</span></div>}
                {synthesis.status === "done" && synthesis.result && vStyle && (
                  <div style={{ animation: "cardIn .5s cubic-bezier(.2,.7,.2,1) both", borderColor: `${vStyle.fg}55`, boxShadow: `0 0 30px ${vStyle.fg}22` }} className="border bg-gradient-to-b from-white/[0.05] to-white/[0.02] rounded-xl p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-4"><Crown size={16} style={{ color: "#f5c451" }} /><span style={{ ...DISP, letterSpacing: "0.06em" }} className="text-sm font-semibold">PORTFOLIO MANAGER · FINAL RULING</span></div>
                    <div className="flex items-center gap-5 flex-wrap">
                      <div style={{ background: vStyle.bg, border: `1px solid ${vStyle.fg}55` }} className="rounded-xl px-6 py-4 text-center"><div style={{ ...DISP, color: vStyle.fg, letterSpacing: "0.05em" }} className="text-3xl font-bold">{vStyle.label}</div><div style={MONO} className="text-[10px] text-white/40 mt-1">{active} · {acct.label}</div></div>
                      <div className="flex-1 min-w-[160px]">
                        <div className="flex items-center justify-between text-[11px] text-white/45 mb-1" style={MONO}><span>CONVICTION</span><span>{synthesis.result.conviction}/10</span></div>
                        <div className="h-2.5 rounded-full bg-white/10 overflow-hidden"><div style={{ width: `${(synthesis.result.conviction / 10) * 100}%`, background: vStyle.fg, transition: "width .8s ease" }} className="h-full rounded-full" /></div>
                        <div className="mt-3 flex items-start gap-2 text-[12px] text-white/60" style={MONO}><TrendingUp size={13} className="mt-0.5 text-white/40" /><span>{synthesis.result.sizing}</span></div>
                      </div>
                    </div>
                    <p className="mt-4 text-[14px] text-white/80 leading-relaxed">{synthesis.result.summary}</p>
                    <div className="mt-4 grid sm:grid-cols-2 gap-3">
                      <div className="rounded-lg p-3" style={{ background: "rgba(56,224,138,0.06)", border: "1px solid rgba(56,224,138,0.18)" }}><div style={{ ...MONO, color: "#38e08a" }} className="text-[10px] mb-1.5 tracking-widest">BULL</div><ul className="space-y-1">{(synthesis.result.bull || []).map((b, i) => <li key={i} className="text-[12px] text-white/70 flex gap-1.5"><span className="text-[#38e08a]">+</span>{b}</li>)}</ul></div>
                      <div className="rounded-lg p-3" style={{ background: "rgba(255,93,108,0.06)", border: "1px solid rgba(255,93,108,0.18)" }}><div style={{ ...MONO, color: "#ff5d6c" }} className="text-[10px] mb-1.5 tracking-widest">RISKS</div><ul className="space-y-1">{(synthesis.result.risks || []).map((b, i) => <li key={i} className="text-[12px] text-white/70 flex gap-1.5"><span className="text-[#ff5d6c]">!</span>{b}</li>)}</ul></div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!active && <div className="mt-12 text-center py-10 border border-dashed border-white/10 rounded-xl"><Crown size={32} className="mx-auto mb-3 opacity-30" style={{ color: "#f5c451" }} /><p className="text-white/45 text-sm">Type a ticker and convene the council for {acct.label}.</p><p style={MONO} className="text-[11px] text-white/25 mt-2">6 specialists review in parallel → the PM delivers one ruling.</p></div>}
          </div>
        )}

        {/* ============ POSITIONS TAB ============ */}
        {tab === "positions" && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-1"><Briefcase size={16} style={{ color: "#7ee787" }} /><span style={{ ...DISP, letterSpacing: "0.04em" }} className="text-sm font-semibold">POSITIONS · {acct.label.toUpperCase()}</span></div>
            <p className="text-[13px] text-white/55 leading-relaxed">Enter what {acct.label} actually holds. The PM and all six agents read these live — so concentration calls, sizing, and the watchdog all reflect your real book, not a generic list.</p>

            <div className="mt-4 space-y-2">
              <div className="hidden sm:flex items-center gap-2 px-1 text-[10px] tracking-widest" style={{ ...MONO, color: "rgba(255,255,255,0.35)" }}>
                <span className="w-16">TICKER</span><span className="flex-1">SHARES</span><span className="flex-1">AVG COST</span><span className="w-8" />
              </div>
              {acctHoldings.map((t) => { const p = posMap[t] || {}; return (
                <div key={t} className="lift bg-white/[0.025] border border-white/10 rounded-xl p-2.5 flex items-center gap-2">
                  <span style={DISP} className="w-16 font-semibold text-sm pl-1">{t}</span>
                  <input value={p.shares || ""} onChange={(e) => setPos(t, "shares", e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="shares" style={MONO}
                    className="flex-1 min-w-0 bg-white/[0.04] border border-white/12 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-[#7ee787]/60 transition-colors" />
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 text-sm" style={MONO}>$</span>
                    <input value={p.cost || ""} onChange={(e) => setPos(t, "cost", e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="avg" style={MONO}
                      className="w-full bg-white/[0.04] border border-white/12 rounded-lg pl-6 pr-2 py-2 text-sm outline-none focus:border-[#7ee787]/60 transition-colors" />
                  </div>
                  <button onClick={() => removeTicker(t)} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/35 hover:text-[#ff5d6c] hover:bg-[#ff5d6c]/10 transition-colors"><X size={15} /></button>
                </div>
              ); })}
            </div>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1"><Plus size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={newTicker} onChange={(e) => setNewTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && addTicker()} placeholder="add ticker (e.g. OKLO)" style={{ ...MONO, letterSpacing: "0.1em" }}
                  className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-2.5 text-sm uppercase outline-none focus:border-[#7ee787]/60 transition-colors" />
              </div>
              <button onClick={addTicker} disabled={!newTicker.trim()} style={{ ...DISP, background: newTicker.trim() ? "#7ee787" : "rgba(126,231,135,0.25)", color: "#06140a" }}
                className="px-4 py-2.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110 disabled:cursor-not-allowed">ADD</button>
            </div>

            <div className="mt-4 rounded-xl p-3 flex items-start gap-2.5" style={{ background: "rgba(126,231,135,0.06)", border: "1px solid rgba(126,231,135,0.2)" }}>
              <Check size={15} style={{ color: "#7ee787" }} className="mt-0.5 shrink-0" />
              <p className="text-[12px] text-white/65 leading-relaxed">The council now sees: <span className="text-white/85">{positionsLine || "no positions yet"}</span></p>
            </div>
            <p style={MONO} className="mt-2 text-[10px] text-white/30">Prototype: saved for this session. The real build stores these permanently per account (Firestore).</p>
          </div>
        )}

        {/* ============ DCA TAB ============ */}
        {tab === "dca" && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-1"><Coins size={16} style={{ color: "#f5c451" }} /><span style={{ ...DISP, letterSpacing: "0.04em" }} className="text-sm font-semibold">SMART DCA ALLOCATOR · {acct.label.toUpperCase()}</span></div>
            <p className="text-[13px] text-white/55 leading-relaxed">Instead of spreading your DCA evenly, the allocator finds the 1–2 holdings that are the best "buy the dip" right now — most oversold but still in a weekly uptrend — and concentrates the dollars there. It skips anything tripping the sell protocol.</p>
            <div className="mt-4 flex gap-2 flex-wrap sm:flex-nowrap items-center">
              <div className="relative flex-1 min-w-[160px]"><Coins size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={dcaAmount} onChange={(e) => setDcaAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder={`amount this round (default $${acct.dca || "—"})`} style={MONO}
                  className="w-full bg-white/[0.04] border border-white/15 rounded-lg pl-9 pr-3 py-3 text-sm outline-none focus:border-[#f5c451]/60 transition-colors" />
              </div>
              <button onClick={allocateDCA} disabled={dca.status === "running"} style={{ ...DISP, letterSpacing: "0.06em", background: dca.status === "running" ? "rgba(245,196,81,0.25)" : "#f5c451", color: "#0a0a0a" }}
                className="glow-btn px-5 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:brightness-110 whitespace-nowrap disabled:cursor-not-allowed">
                {dca.status === "running" ? <><Loader2 size={16} className="animate-spin" /> ALLOCATING…</> : <>ALLOCATE</>}</button>
              <button onClick={runDCADemo} disabled={dca.status === "running"} style={MONO} className="text-[11px] px-3 py-3 rounded-lg border border-[#38e0d4]/40 text-[#38e0d4] hover:bg-[#38e0d4]/10 transition-colors disabled:opacity-40 flex items-center gap-1.5"><Play size={11} /> DEMO</button>
            </div>

            {dca.status === "running" && <div className="mt-5 bg-white/[0.025] border border-[#f5c451]/30 rounded-xl p-6 flex items-center gap-3 text-[#f5c451]" style={MONO}><Loader2 size={18} className="animate-spin" /><span className="text-sm">Scanning {acctHoldings.length} holdings for the best dip…</span></div>}
            {dca.status === "done" && dca.result && (
              <div style={{ animation: "cardIn .5s ease both" }} className="mt-5">
                {(dca.result.allocations || []).map((al, i) => (
                  <div key={i} className="lift mb-2 bg-white/[0.03] border border-white/10 rounded-xl p-4 flex items-center gap-4">
                    <div className="text-center min-w-[64px]"><div style={DISP} className="text-xl font-bold text-[#f5c451]">${al.amount}</div><div style={MONO} className="text-[9px] text-white/40">{al.pct}%</div></div>
                    <div className="flex-1"><div style={DISP} className="text-base font-semibold">{al.ticker}</div><div className="text-[12px] text-white/60 leading-snug">{al.reason}</div></div>
                  </div>
                ))}
                {dca.result.summary && <p className="mt-3 text-[13px] text-white/70 leading-relaxed border-l-2 border-[#f5c451]/40 pl-3">{dca.result.summary}</p>}
                <p style={MONO} className="mt-3 text-[10px] text-white/30">You execute the buys — this is a suggestion, not an order.</p>
              </div>
            )}
            {dca.status === "idle" && <div className="mt-8 text-center py-10 border border-dashed border-white/10 rounded-xl"><Coins size={30} className="mx-auto mb-3 opacity-30" style={{ color: "#f5c451" }} /><p className="text-white/45 text-sm">Hit ALLOCATE to route {acct.label}'s DCA into the best dip.</p></div>}
          </div>
        )}

        {/* ============ WATCHDOG TAB ============ */}
        {tab === "watchdog" && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-1"><Radar size={16} style={{ color: "#38e0d4" }} /><span style={{ ...DISP, letterSpacing: "0.04em" }} className="text-sm font-semibold">SELL-PROTOCOL WATCHDOG · {acct.label.toUpperCase()}</span></div>
            <p className="text-[13px] text-white/55 leading-relaxed">Scans every holding against your sell protocol — a SELL flag only fires on a confirmed weekly downtrend (lower highs/lower lows) with red candles, never on news or valuation alone. This is what catches a FLY-type breakdown before it eats your gains.</p>
            <div className="mt-4 flex gap-2 items-center">
              <button onClick={scanWatchdog} disabled={wdRunning} style={{ ...DISP, letterSpacing: "0.06em", background: wdRunning ? "rgba(56,224,212,0.25)" : "#38e0d4", color: "#0a0a0a", animationName: wdRunning ? "none" : undefined }}
                className="glow-btn px-5 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:brightness-110 whitespace-nowrap disabled:cursor-not-allowed">
                {wdRunning ? <><Loader2 size={16} className="animate-spin" /> SCANNING…</> : <><Radar size={15} /> SCAN ALL {acctHoldings.length} HOLDINGS</>}</button>
              <button onClick={runWatchdogDemo} disabled={wdRunning} style={MONO} className="text-[11px] px-3 py-3 rounded-lg border border-[#f5c451]/40 text-[#f5c451] hover:bg-[#f5c451]/10 transition-colors disabled:opacity-40 flex items-center gap-1.5"><Play size={11} /> DEMO</button>
            </div>

            {wdRan && (wdFlagged > 0 || wdWatch > 0) && !wdRunning && (
              <div className="mt-4 rounded-lg p-3 flex items-center gap-3" style={{ background: wdFlagged ? "rgba(255,93,108,0.1)" : "rgba(245,196,81,0.1)", border: `1px solid ${wdFlagged ? "rgba(255,93,108,0.3)" : "rgba(245,196,81,0.3)"}` }}>
                <AlertTriangle size={16} style={{ color: wdFlagged ? "#ff5d6c" : "#f5c451" }} />
                <span className="text-[13px] text-white/80">{wdFlagged > 0 ? `${wdFlagged} holding(s) tripping the sell protocol` : `${wdWatch} holding(s) weakening — watch closely`}{wdFlagged > 0 && wdWatch > 0 ? `, ${wdWatch} more on watch.` : "."}</span>
              </div>
            )}

            {wdRan && (
              <div className="mt-4 grid sm:grid-cols-2 gap-2">
                {acctHoldings.map((h) => { const st = wd[h] || { status: "idle" }; const r = st.result; const sty = r && WD_STYLE[r.status]; const Icon = sty ? sty.icon : Loader2;
                  return (
                    <div key={h} style={{ animation: st.status === "done" ? "cardIn .4s ease both" : undefined, borderColor: sty ? `${sty.fg}40` : "rgba(255,255,255,0.08)" }} className="hud lift relative bg-white/[0.025] border rounded-xl p-3.5 flex items-start gap-3">
                      <div className="rounded-lg p-2 mt-0.5" style={{ background: sty ? sty.bg : "rgba(255,255,255,0.05)" }}>{st.status === "running" ? <Loader2 size={15} className="animate-spin text-white/40" /> : sty ? <Icon size={15} style={{ color: sty.fg }} /> : <Loader2 size={15} className="text-white/30" />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2"><span style={DISP} className="font-semibold">{h}</span>{sty && <span style={{ ...MONO, background: sty.bg, color: sty.fg }} className="text-[9px] font-semibold px-2 py-0.5 rounded whitespace-nowrap">{sty.label}</span>}</div>
                        {st.status === "running" && <div style={MONO} className="text-[11px] text-white/35 mt-1">checking weekly…</div>}
                        {st.status === "error" && <div style={MONO} className="text-[11px] text-[#ff5d6c] mt-1">scan error</div>}
                        {r && <p className="text-[12px] text-white/60 leading-snug mt-1">{r.note}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!wdRan && <div className="mt-8 text-center py-10 border border-dashed border-white/10 rounded-xl"><Radar size={30} className="mx-auto mb-3 opacity-30" style={{ color: "#38e0d4" }} /><p className="text-white/45 text-sm">Scan {acct.label}'s {acctHoldings.length} holdings against the sell protocol.</p></div>}
          </div>
        )}

        {/* ============ ROADMAP TAB ============ */}
        {tab === "roadmap" && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-1"><Map size={16} style={{ color: "#b083ff" }} /><span style={{ ...DISP, letterSpacing: "0.04em" }} className="text-sm font-semibold">BUILD ROADMAP</span></div>
            <p className="text-[13px] text-white/55 leading-relaxed">Everything we agreed is worth building, so nothing gets forgotten. Top section is live in this prototype; the rest is the plan, ranked by how much edge it adds.</p>
            <div className="mt-5 space-y-6">
              {ROADMAP.map((group) => (
                <div key={group.tier}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span style={{ ...MONO, color: group.color }} className="text-[10px] tracking-widest font-semibold">{group.tier}</span>
                    <div className="h-px flex-1" style={{ background: `${group.color}22` }} />
                    <span style={MONO} className="text-[10px] text-white/30">{group.items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((it) => {
                      const built = group.tier === "BUILT";
                      return (
                        <div key={it.name} className="lift flex items-start gap-3 bg-white/[0.025] border rounded-xl p-3.5" style={{ borderColor: built ? `${group.color}33` : "rgba(255,255,255,0.08)" }}>
                          <div className="rounded-lg p-1.5 mt-0.5" style={{ background: `${group.color}1a` }}>
                            {built ? <Check size={14} style={{ color: group.color }} /> : <CircleDot size={14} style={{ color: group.color }} />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2"><span style={DISP} className="text-sm font-semibold">{it.name}</span>{built && <span style={{ ...MONO, color: group.color }} className="text-[8px] px-1.5 py-0.5 rounded" >LIVE</span>}</div>
                            <p className="text-[12px] text-white/55 leading-snug mt-0.5">{it.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl p-4 flex items-start gap-3" style={{ background: "rgba(245,196,81,0.08)", border: "1px solid rgba(245,196,81,0.25)" }}>
              <Clock size={16} style={{ color: "#f5c451" }} className="mt-0.5" />
              <div><div style={DISP} className="text-sm font-semibold text-[#f5c451]">When ready</div><p className="text-[12px] text-white/65 leading-relaxed mt-0.5">Package the whole thing as a build brief for Claude Code → real multi-file app, wired to your live data, deployed phone-accessible via Firebase.</p></div>
            </div>
          </div>
        )}

        <p className="mt-8 text-[10px] text-white/25 text-center leading-relaxed" style={MONO}>PROTOTYPE · LIVE WEB DATA, NO BROKERAGE LINK YET · NOT FINANCIAL ADVICE — YOU EXECUTE, YOU DECIDE</p>
      </div>
    </div>
  );
}
