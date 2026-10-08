import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { addHistory, getSettings } from "./store";
import { sendNotification } from "./notify";

const PAGE_URL = "https://www.gate.com/ru/announcements/delisted";
const FILE = path.join(process.cwd(), "data", "announcements.json");
const INTERVAL_MS = 10 * 60 * 1000;
const MAX_SEEN = 400;

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
  source: PAGE_URL,
  checkedAt: null,
  items: [],
};

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
  Referer: "https://www.gate.com/",
};

let running = false;
let lastRun = 0;
let loopStarted = false;

async function loadStore(): Promise<AnnouncementStore> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AnnouncementStore>;
    return {
      source: parsed.source ?? PAGE_URL,
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

function parseList(html: string): AnnouncementItem[] {
  const marker = html.indexOf("__NEXT_DATA__");
  if (marker < 0) throw new Error("На странице Gate нет данных анонсов");
  const open = html.indexOf(">", marker) + 1;
  const close = html.indexOf("</script>", open);
  if (open <= 0 || close < 0) throw new Error("На странице Gate нет данных анонсов");
  const data = JSON.parse(html.slice(open, close)) as {
    props?: { pageProps?: { listData?: { list?: Array<{ id?: number | string; title?: string; url?: string }> } } };
  };
  const list = data.props?.pageProps?.listData?.list ?? [];
  const items: AnnouncementItem[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    const pathUrl = String(row.url ?? "").trim();
    const id = String(row.id ?? pathUrl.split("/").pop() ?? "");
    const title = String(row.title ?? "").replace(/\s+/g, " ").trim();
    if (!id || !title) continue;
    const url = pathUrl.startsWith("http")
      ? pathUrl
      : `https://www.gate.com/ru${pathUrl.startsWith("/") ? pathUrl : `/announcements/article/${id}`}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, url });
  }
  if (!items.length) throw new Error("Не удалось найти записи делистинга на странице Gate");
  return items;
}

export async function getAnnouncementStatus() {
  return loadStore();
}

export async function checkDelistings(force = false) {
  if (running) return { skipped: true as const, newItems: [] as AnnouncementItem[] };
  if (!force && lastRun && Date.now() - lastRun < INTERVAL_MS - 5_000) {
    return { skipped: true as const, newItems: [] as AnnouncementItem[] };
  }

  running = true;
  try {
    const res = await fetch(PAGE_URL, {
      headers: FETCH_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Gate ${res.status}`);
    const html = await res.text();
    const latest = parseList(html);
    const store = await loadStore();
    const known = new Set(store.items.flatMap((item) => [item.id, item.title]));
    const isFirstRun = store.items.length === 0;
    const newItems = isFirstRun ? [] : latest.filter((item) => !known.has(item.id) && !known.has(item.title));

    const merged = [...latest, ...store.items.filter((old) => !latest.some((item) => item.id === old.id))].slice(
      0,
      MAX_SEEN,
    );
    await saveStore({
      source: PAGE_URL,
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

    return { skipped: false as const, firstRun: isFirstRun, newItems };
  } finally {
    running = false;
  }
}

export function startDelistLoop() {
  if (loopStarted) return;
  loopStarted = true;
  const tick = async () => {
    try {
      await checkDelistings(true);
    } catch (err) {
      console.error("delist check failed", err);
    }
  };
  void tick();
  setInterval(tick, INTERVAL_MS);
}
