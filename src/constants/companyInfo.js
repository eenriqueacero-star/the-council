/**
 * Ground-truth company identity for every ticker that appears in a portfolio.
 * This exists ONLY to stop the chat from hallucinating company names/sectors
 * (e.g. calling ALAB "Alabama", NBIS "Neurocrine", FLY "Flywire", CRDO a
 * "blockchain company"). Prices/day-change always come from live Finnhub
 * quotes at request time — never hardcoded here.
 *
 * If a ticker isn't in this map, the chat is instructed to say so rather
 * than guess — see buildHoldingsBlock() in utils/chatGrounding.js.
 */
export const COMPANY_INFO = {
  NVDA: { name: 'NVIDIA Corporation',        sector: 'AI/GPU semiconductors' },
  MU:   { name: 'Micron Technology',          sector: 'Memory/storage semiconductors' },
  AMD:  { name: 'Advanced Micro Devices',     sector: 'CPU/GPU semiconductors' },
  CRDO: { name: 'Credo Technology Group',     sector: 'Connectivity semiconductors (AEC/SerDes for data centers)' },
  NBIS: { name: 'Nebius Group',               sector: 'AI cloud infrastructure (Yandex spinoff)' },
  ALAB: { name: 'Astera Labs',                sector: 'Connectivity semiconductors (data center interconnect)' },
  APLD: { name: 'Applied Digital',            sector: 'AI/HPC data centers' },
  SNDK: { name: 'Sandisk Corporation',        sector: 'Flash memory/storage' },
  FLY:  { name: 'Firefly Aerospace',          sector: 'Space launch vehicles' },
  AAPL: { name: 'Apple Inc.',                 sector: 'Consumer electronics/services' },
  TSLA: { name: 'Tesla, Inc.',                sector: 'Electric vehicles/energy' },
  OKLO: { name: 'Oklo Inc.',                  sector: 'Advanced nuclear reactors' },
  PLTR: { name: 'Palantir Technologies',      sector: 'Data analytics/AI software' },
  AVGO: { name: 'Broadcom Inc.',              sector: 'Semiconductors/infrastructure software' },
  SMCI: { name: 'Super Micro Computer',       sector: 'AI server hardware' },
  SPY:  { name: 'SPDR S&P 500 ETF Trust',     sector: 'S&P 500 index ETF' },
};

/** Returns "Name — sector" for known tickers, or null so callers can fall back honestly. */
export function lookupCompany(ticker) {
  const info = COMPANY_INFO[String(ticker || '').toUpperCase()];
  return info || null;
}
