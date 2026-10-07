import type { CoinInfo, Quote } from "./types";

type TickerFn = (symbol: string, quote: Quote) => Promise<number>;

const cache = new Map<string, { at: number; value: number }>();
let coinCache: { at: number; coins: CoinInfo[] } | null = null;

async function json(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const binance: TickerFn = async (symbol, quote) => {
  const pair = `${symbol}${quote}`.toUpperCase();
  const data = await json(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
  return Number(data.price);
};

const mexc: TickerFn = async (symbol, quote) => {
  const pair = `${symbol}${quote}`.toUpperCase();
  const data = await json(`https://api.mexc.com/api/v3/ticker/price?symbol=${pair}`);
  return Number(data.price);
};

const gate: TickerFn = async (symbol, quote) => {
  const pair = `${symbol}_${quote}`.toUpperCase();
  const data = await json(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`);
  const row = Array.isArray(data) ? data[0] : data;
  return Number(row?.last);
};

const fetchers: Record<string, TickerFn> = {
  binance,
  "gate.io": gate,
  gate: gate,
  mexc,
};

export function pairKey(exchange: string, symbol: string, quote: string) {
  return `${exchange}:${symbol}:${quote}`.toLowerCase();
}

export async function getPrice(exchange: string, symbol: string, quote: Quote): Promise<number> {
  const key = pairKey(exchange, symbol, quote);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 4000) return hit.value;

  const fn = fetchers[exchange.toLowerCase()] ?? binance;
  const value = await fn(symbol.toUpperCase(), quote);
  if (!Number.isFinite(value)) throw new Error("Invalid price");
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function listBinanceCoins(): Promise<CoinInfo[]> {
  if (coinCache && Date.now() - coinCache.at < 10 * 60 * 1000) return coinCache.coins;
  const info = await json("https://api.binance.com/api/v3/exchangeInfo");
  const coins: CoinInfo[] = [];
  for (const s of info.symbols as Array<{
    status: string;
    baseAsset: string;
    quoteAsset: string;
    symbol: string;
  }>) {
    if (s.status !== "TRADING") continue;
    if (!["USDT", "USDC", "BTC"].includes(s.quoteAsset)) continue;
    coins.push({
      symbol: s.symbol,
      base: s.baseAsset,
      quote: s.quoteAsset,
      exchange: "Binance",
    });
  }
  coins.sort((a, b) => a.base.localeCompare(b.base));
  coinCache = { at: Date.now(), coins };
  return coins;
}
