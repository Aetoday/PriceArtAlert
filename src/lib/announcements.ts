import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import RssParser from "rss-parser";
import { addHistory, getSettings } from "./store";
import { sendNotification } from "./notify";

const RSS_URLS = [
  "https://www.gate.io/announcements/rss",
  "https://www.gate.com/announcements/rss",
];
const HTML_URLS = [
  "https://www.gate.io/announcements/delisted",
  "https://www.gate.com/ru/announcements/delisted",
];
const FILE = path.join(process.cwd(), "data", "announcements.json");
const INTERVAL_MS = 10 * 60 * 1000;
const REQUEST_GAP_MS = 5_000;
const MAX_SEEN = 400;
const DELIST_RE = /delist|делист|off.?list|снят[аы]?\s+с\s+торг/i;

export interface AnnouncementItem {
  id: string;
  title: string;
  url: string;
}

export interface AnnouncementStore {
  source: string;
  checkedAt: number | null;
  items: AnnouncementItem[];
}

const emptyStore: AnnouncementStore = {
  source: HTML_URLS[0],
  checkedAt: null,
  items: [],
};

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/xhtml+xml, application/xml, text/html;q=0.9, */*;q=0.8",
  "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: "https://www.gate.io/",
  Origin: "https://www.gate.io",
  "Sec-Ch-Ua": '"Chromium";v="128", "Not=A?Brand";v="24", "Google Chrome";v="128"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const rssParser = new RssParser({ timeout: 20_000, headers: BROWSER_HEADERS });

let running = false;
let lastRun = 0;
let lastRequestAt = 0;
let loopStarted = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pauseBetweenRequests() {
  const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (lastRequestAt && wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function loadStore(): Promise<AnnouncementStore> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AnnouncementStore>;
    return {
      source: parsed.source ?? HTML_URLS[0],
      checkedAt: parsed.checkedAt ?? null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { ...emptyStore, items: [] };
  }
}

async function saveStore(store: AnnouncementStore) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(store, null, 2), "utf8");
}

function itemFrom(title: string, rawUrl: string, fallbackId = ""): AnnouncementItem | null {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  let url = rawUrl.trim();
  if (!url && fallbackId) url = `https://www.gate.io/announcements/article/${fallbackId}`;
  if (!cleanTitle || !url) return null;
  if (url.startsWith("/")) url = `https://www.gate.io${url}`;
  const id = fallbackId || (url.match(/\/(?:article|announcements)\/(\d+)/)?.[1] ?? url);
  return { id, title: cleanTitle, url };
}

async function parseRssFeed(xml: string): Promise<AnnouncementItem[]> {
  if (!/<rss[\s>]|<feed[\s>]/i.test(xml)) return [];
  const feed = await rssParser.parseString(xml);
  const items: AnnouncementItem[] = [];
  const seen = new Set<string>();
  for (const entry of feed.items ?? []) {
    const parsed = itemFrom(entry.title ?? "", entry.link ?? "", entry.guid ?? "");
    if (!parsed) continue;
    if (!DELIST_RE.test(`${parsed.title} ${parsed.url}`)) continue;
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    items.push(parsed);
  }
  return items;
}

function parseHtmlList(html: string): AnnouncementItem[] {
  const marker = html.indexOf("__NEXT_DATA__");
  if (marker >= 0) {
    const open = html.indexOf(">", marker) + 1;
    const close = html.indexOf("</script>", open);
    if (open > 0 && close > open) {
      const data = JSON.parse(html.slice(open, close)) as {
        props?: { pageProps?: { listData?: { list?: Array<{ id?: number | string; title?: string; url?: string }> } } };
      };
      const list = data.props?.pageProps?.listData?.list ?? [];
      const items: AnnouncementItem[] = [];
      const seen = new Set<string>();
      for (const row of list) {
        const parsed = itemFrom(String(row.title ?? ""), String(row.url ?? ""), String(row.id ?? ""));
        if (!parsed || seen.has(parsed.id)) continue;
        seen.add(parsed.id);
        items.push(parsed);
      }
      if (items.length) return items;
    }
  }

  const items: AnnouncementItem[] = [];
  const seen = new Set<string>();
  const re = /href="([^"]*\/announcements\/article\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const title = match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const parsed = itemFrom(title, match[1], match[2]);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    items.push(parsed);
  }
  return items;
}

async function fetchText(url: string) {
  await pauseBetweenRequests();
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gate ${res.status}`);
  return text;
}

async function loadFromRss(): Promise<{ items: AnnouncementItem[]; source: string } | null> {
  for (const url of RSS_URLS) {
    try {
      const body = await fetchText(url);
      const items = await parseRssFeed(body);
      if (items.length) return { items, source: url };
      console.warn("Gate RSS is not a feed:", url);
    } catch (err) {
      console.warn("Gate RSS failed", url, err);
    }
  }
  return null;
}

async function loadFromHtml(): Promise<{ items: AnnouncementItem[]; source: string } | null> {
  for (const url of HTML_URLS) {
    try {
      const html = await fetchText(url);
      const items = parseHtmlList(html);
      if (items.length) return { items, source: url };
    } catch (err) {
      console.warn("Gate HTML failed", url, err);
    }
  }
  return null;
}

async function loadFromWebsocket(): Promise<{ items: AnnouncementItem[]; source: string } | null> {
  if (typeof WebSocket === "undefined") return null;
  const source = "wss://api.gateio.ws/ws/v4/ann";
  return new Promise((resolve) => {
    const items: AnnouncementItem[] = [];
    const seen = new Set<string>();
    let done = false;
    const ws = new WebSocket(source);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(items.length ? { items, source } : null);
    };
    const timer = setTimeout(finish, 8_000);
    ws.addEventListener("open", () => {
      const time = Math.floor(Date.now() / 1000);
      for (const lang of ["en", "cn"] as const) {
        ws.send(
          JSON.stringify({
            time,
            channel: "announcement.summary_delisting",
            event: "subscribe",
            payload: [lang],
          }),
        );
      }
    });
    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          result?: { title?: string; origin_url?: string; published_at?: number };
        };
        const result = msg.result;
        if (!result?.title) return;
        const parsed = itemFrom(result.title, result.origin_url ?? "", String(result.published_at ?? ""));
        if (!parsed || seen.has(parsed.id)) return;
        seen.add(parsed.id);
        items.push(parsed);
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.addEventListener("error", finish);
    ws.addEventListener("close", finish);
  });
}

async function loadLatest(): Promise<{ items: AnnouncementItem[]; source: string }> {
  const rss = await loadFromRss();
  if (rss?.items.length) return rss;
  const html = await loadFromHtml();
  if (html?.items.length) return html;
  const socket = await loadFromWebsocket();
  if (socket?.items.length) return socket;
  throw new Error("Не удалось получить делистинги Gate ни из RSS, ни со страницы");
}

export async function getAnnouncementStatus() {
  return loadStore();
}

export async function checkAnnouncements(force = false) {
  if (running) return { skipped: true as const, newItems: [] as AnnouncementItem[] };
  if (!force && lastRun && Date.now() - lastRun < INTERVAL_MS - 5_000) {
    return { skipped: true as const, newItems: [] as AnnouncementItem[] };
  }

  running = true;
  try {
    const latest = await loadLatest();
    const store = await loadStore();
    const known = new Set(store.items.flatMap((item) => [item.id, item.title]));
    const isFirstRun = store.items.length === 0;
    const newItems = isFirstRun ? [] : latest.items.filter((item) => !known.has(item.id) && !known.has(item.title));

    const merged = [
      ...latest.items,
      ...store.items.filter((old) => !latest.items.some((item) => item.id === old.id)),
    ].slice(0, MAX_SEEN);
    await saveStore({
      source: latest.source,
      checkedAt: Date.now(),
      items: merged,
    });
    lastRun = Date.now();

    if (newItems.length) {
      const settings = await getSettings();
      for (const item of newItems) {
        const message = `Gate делистинг:\n${item.title}\n${item.url}`;
        try {
          await sendNotification("telegram", message, settings);
        } catch (err) {
          console.error("delist telegram failed", err);
        }
        await addHistory({
          id: randomUUID(),
          alertId: "gate-delist",
          message,
          price: 0,
          at: Date.now(),
        });
      }
    }

    return { skipped: false as const, firstRun: isFirstRun, newItems, source: latest.source };
  } finally {
    running = false;
  }
}

export const checkDelistings = checkAnnouncements;

export function startDelistLoop() {
  if (loopStarted) return;
  loopStarted = true;
  const tick = async () => {
    try {
      await checkAnnouncements(true);
    } catch (err) {
      console.error("delist check failed", err);
    }
  };
  void tick();
  setInterval(tick, INTERVAL_MS);
}
