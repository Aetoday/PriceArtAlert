"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AlertHistoryItem, AlertKind, Channel, CoinInfo, Direction, PriceAlert, Quote } from "@/lib/types";

const TABS: { id: AlertKind | "soon"; label: string }[] = [
  { id: "price", label: "Price" },
  { id: "percent", label: "Percent" },
  { id: "soon", label: "Periodic" },
  { id: "soon", label: "Volume" },
  { id: "soon", label: "Funding" },
  { id: "soon", label: "MarketCap" },
  { id: "soon", label: "Dominance" },
  { id: "soon", label: "Stocks" },
];

const COOLDOWNS = [
  { label: "1 минута", value: 1 },
  { label: "5 минут", value: 5 },
  { label: "15 минут", value: 15 },
  { label: "1 час", value: 60 },
  { label: "6 часов", value: 360 },
  { label: "1 день", value: 1440 },
];

const EXCHANGES = ["Binance", "Gate.io", "MEXC"];

export function Dashboard() {
  const [kind, setKind] = useState<AlertKind>("price");
  const [sideTab, setSideTab] = useState<"details" | "options">("options");
  const [listTab, setListTab] = useState<"active" | "history">("active");
  const [channel, setChannel] = useState<Channel>("telegram");
  const [symbol, setSymbol] = useState("SOL");
  const [quote, setQuote] = useState<Quote>("USDT");
  const [exchange, setExchange] = useState("Binance");
  const [direction, setDirection] = useState<Direction>("above");
  const [targetPrice, setTargetPrice] = useState("0.00");
  const [percentChange, setPercentChange] = useState("5");
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [note, setNote] = useState("");
  const [oneShot, setOneShot] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [priceError, setPriceError] = useState("");
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [coins, setCoins] = useState<CoinInfo[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [toast, setToast] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const popular = useMemo(
    () => ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "TON", "ADA"],
    [],
  );

  const filteredCoins = useMemo(() => {
    const q = query.trim().toUpperCase();
    const bases = new Set<string>();
    for (const c of coins) {
      if (c.quote !== quote) continue;
      if (!q || c.base.includes(q)) bases.add(c.base);
    }
    const list = [...bases];
    if (!q) {
      return [...popular.filter((p) => list.includes(p)), ...list.filter((b) => !popular.includes(b))].slice(0, 40);
    }
    return list.slice(0, 40);
  }, [coins, popular, query, quote]);

  const loadAlerts = useCallback(async () => {
    const res = await fetch("/api/alerts");
    setAlerts(await res.json());
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/history");
    setHistory(await res.json());
  }, []);

  useEffect(() => {
    void loadAlerts();
    void loadHistory();
    fetch("/api/coins")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setCoins(d);
      })
      .catch(() => undefined);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setTelegramChatId(s.telegramChatId ?? "");
        if (s.hasTelegram) setTelegramBotToken("••••");
        if (s.hasDiscord) setDiscordWebhookUrl("••••");
      })
      .catch(() => undefined);
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [loadAlerts, loadHistory]);

  useEffect(() => {
    let stop = false;
    const run = async () => {
      setPriceError("");
      try {
        const res = await fetch(
          `/api/prices?symbol=${encodeURIComponent(symbol)}&quote=${quote}&exchange=${encodeURIComponent(exchange)}`,
        );
        const data = await res.json();
        if (stop) return;
        if (!res.ok) {
          setPrice(null);
          setPriceError("Нет пары на этой бирже");
          return;
        }
        setPrice(data.price);
      } catch {
        if (!stop) setPriceError("Не удалось получить цену");
      }
    };
    void run();
    const id = setInterval(run, 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [symbol, quote, exchange]);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch("/api/check", { method: "POST" });
      const data = await res.json();
      if (Array.isArray(data.fired) && data.fired.length) {
        for (const item of data.fired) {
          if (item.alert?.channel === "browser" && "Notification" in window && Notification.permission === "granted") {
            new Notification("PriceArtAlert", { body: item.message });
          }
        }
        setToast(data.fired[0].message);
        void loadAlerts();
        void loadHistory();
      }
    }, 12000);
    return () => clearInterval(id);
  }, [loadAlerts, loadHistory]);

  function startEdit(alert: PriceAlert) {
    setEditingId(alert.id);
    setKind(alert.kind);
    setChannel(alert.channel);
    setSymbol(alert.symbol);
    setQuery("");
    setQuote(alert.quote);
    setExchange(alert.exchange);
    setDirection(alert.direction);
    setTargetPrice(alert.targetPrice != null ? String(alert.targetPrice) : "0.00");
    setPercentChange(alert.percentChange != null ? String(alert.percentChange) : "5");
    setCooldownMinutes(alert.cooldownMinutes);
    setNote(alert.note);
    setOneShot(alert.oneShot);
    setSideTab("options");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setNote("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        kind,
        channel,
        symbol,
        quote,
        exchange,
        direction,
        targetPrice: kind === "price" ? Number(targetPrice) : null,
        percentChange: kind === "percent" ? Number(percentChange) : null,
        cooldownMinutes,
        note,
        oneShot,
        lastTriggeredAt: null,
        baselinePrice: null,
      };
      const res = editingId
        ? await fetch(`/api/alerts/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error("save failed");
      setToast(editingId ? "Алерт обновлён" : "Алерт сохранён");
      setEditingId(null);
      setNote("");
      await loadAlerts();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(alert: PriceAlert) {
    await fetch(`/api/alerts/${alert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !alert.enabled }),
    });
    await loadAlerts();
  }

  async function remove(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    if (editingId === id) cancelEdit();
    await loadAlerts();
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramBotToken, telegramChatId, discordWebhookUrl }),
    });
    setSettingsOpen(false);
    setToast("Настройки сохранены");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-5 flex items-center justify-center">
        <nav className="flex flex-wrap justify-center gap-1 rounded-full bg-[#1a2332] p-1 text-sm text-[#9aa8bd]">
          {TABS.map((tab, i) => (
            <button
              key={`${tab.label}-${i}`}
              className={`rounded-full px-3 py-1.5 ${kind === tab.id ? "tab-active text-white" : "hover:text-white"}`}
              onClick={() => {
                if (tab.id === "soon") {
                  setToast("Этот тип алерта появится позже");
                  return;
                }
                setKind(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="rounded-2xl border border-[#2d3b50] bg-[#1a2332] p-6 shadow-2xl shadow-black/30">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.9fr]">
          <form onSubmit={onSubmit}>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold text-[#e85d8a]">Price Alert</h1>
              <p className="mt-1 text-sm text-[#8b9bb4]">
                {kind === "price"
                  ? "Локальные оповещения: когда монета выше или ниже целевой цены."
                  : "Локальные оповещения при резком процентном движении."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-[15px] leading-8">
              <span>Пришли мне</span>
              <select className="field" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
                <option value="browser">браузер</option>
              </select>
              <span>как только</span>
              <div className="relative">
                <input
                  className="field w-28"
                  value={query || symbol}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSymbol(e.target.value.toUpperCase());
                  }}
                  onFocus={() => setQuery(symbol)}
                />
                {query && (
                  <div className="absolute z-20 mt-1 max-h-48 w-40 overflow-auto rounded-lg border border-[#2d3b50] bg-[#141c29] text-sm">
                    {filteredCoins.map((c) => (
                      <button
                        type="button"
                        key={c}
                        className="block w-full px-3 py-1.5 text-left hover:bg-[#2a3548]"
                        onClick={() => {
                          setSymbol(c);
                          setQuery("");
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span>уйдёт</span>
              <select className="field" value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
                <option value="above">выше</option>
                <option value="below">ниже</option>
              </select>
              {kind === "price" ? (
                <>
                  <span>цены</span>
                  <input
                    className="field w-28"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    inputMode="decimal"
                  />
                </>
              ) : (
                <>
                  <span>на</span>
                  <input
                    className="field w-20"
                    value={percentChange}
                    onChange={(e) => setPercentChange(e.target.value)}
                    inputMode="decimal"
                  />
                  <span>%</span>
                </>
              )}
              <select className="field" value={quote} onChange={(e) => setQuote(e.target.value as Quote)}>
                <option value="USDT">Tether (USDT)</option>
                <option value="USDC">USDC</option>
                <option value="BTC">BTC</option>
              </select>
              <span>на</span>
              <select className="field" value={exchange} onChange={(e) => setExchange(e.target.value)}>
                {EXCHANGES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>

            <p className="mt-4 text-sm text-[#3ecf8e]">
              {priceError
                ? priceError
                : price != null
                  ? `Цена ${symbol} сейчас ${price} ${quote}.`
                  : "Загружаю цену…"}
            </p>

            <div className="mt-8 flex flex-col items-center">
              <div className="flex items-center gap-3">
                <button
                  disabled={busy}
                  className="rounded-md border border-white/80 px-8 py-2.5 text-sm font-semibold tracking-wide hover:bg-white hover:text-[#121826]"
                >
                  {editingId ? "SAVE ALERT" : "SET ALERT"}
                </button>
                {editingId && (
                  <button type="button" className="text-sm text-[#8b9bb4] underline" onClick={cancelEdit}>
                    Отмена
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs text-[#8b9bb4]">
                {editingId ? "Редактирование алерта" : <>Активных алертов: <span className="text-[#3ecf8e]">{alerts.filter((a) => a.enabled).length}</span></>}
              </p>
            </div>
          </form>

          <aside>
            <div className="mb-4 flex justify-end gap-6 text-sm">
              <button className={sideTab === "details" ? "text-[#e85d8a]" : "text-[#8b9bb4]"} onClick={() => setSideTab("details")}>
                Details
              </button>
              <button
                className={`${sideTab === "options" ? "text-[#e85d8a] border-b-2 border-[#e85d8a]" : "text-[#8b9bb4]"} pb-1`}
                onClick={() => setSideTab("options")}
              >
                Options
              </button>
            </div>

            {sideTab === "options" ? (
              <div className="space-y-4 text-sm">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[#c5d0e0]">Cooldown</span>
                  <select
                    className="field"
                    value={cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                  >
                    {COOLDOWNS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[#c5d0e0]">Заметка</span>
                  <input className="field w-40" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 text-[#c5d0e0]">
                  <input type="checkbox" checked={oneShot} onChange={(e) => setOneShot(e.target.checked)} />
                  Выключить алерт после первого срабатывания
                </label>
                <p className="pt-6 text-xs text-[#8b9bb4]">
                  Также можно ловить резкие движения во вкладке <span className="text-[#3ecf8e]">Percent</span>.
                </p>
                <button type="button" className="text-xs text-[#e85d8a] underline" onClick={() => setSettingsOpen(true)}>
                  Telegram / Discord настройки
                </button>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-[#8b9bb4]">
                <p>Цены берутся с выбранной биржи (Binance, Gate.io, MEXC).</p>
                <p>Проверка каждые ~12 секунд, пока открыт сайт или работает `npm run watch`.</p>
                <p>Для Telegram создай бота в @BotFather и укажи токен и свой chat id.</p>
                <p>
                  Делистинги Gate проверяются каждые 10 минут через RSS, а если фид недоступен — со страницы анонсов.
                  Новые записи уходят в Telegram, заголовки пишутся в{" "}
                  <span className="text-[#c5d0e0]">data/announcements.json</span>.
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-6 flex justify-center gap-8 text-sm">
          <button
            className={listTab === "active" ? "border-b-2 border-[#e85d8a] pb-1 text-[#e85d8a]" : "text-[#8b9bb4]"}
            onClick={() => setListTab("active")}
          >
            Active Alerts
          </button>
          <button
            className={listTab === "history" ? "border-b-2 border-[#e85d8a] pb-1 text-[#e85d8a]" : "text-[#8b9bb4]"}
            onClick={() => setListTab("history")}
          >
            Alert History
          </button>
        </div>

        {listTab === "active" ? (
          <ul className="space-y-4">
            {alerts.length === 0 && <li className="text-center text-sm text-[#8b9bb4]">Пока нет алертов</li>}
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={`flex items-center justify-between gap-4 text-sm ${editingId === alert.id ? "rounded-lg bg-[#222d3f] px-2 py-1" : ""}`}
              >
                <p className="text-[#c5d0e0]">
                  Прислать{" "}
                  <span className="text-[#3ecf8e]">
                    {alert.channel === "telegram" ? "Telegram" : alert.channel === "discord" ? "Discord" : "браузер"}
                  </span>{" "}
                  как только {alert.symbol} уйдёт{" "}
                  <span className="text-[#3ecf8e]">{alert.direction === "above" ? "выше" : "ниже"}</span>{" "}
                  {alert.kind === "percent"
                    ? `${alert.percentChange}%`
                    : `цены ${alert.targetPrice} ${alert.quote}`}{" "}
                  на {alert.exchange}.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    aria-label="toggle"
                    onClick={() => toggle(alert)}
                    className={`h-5 w-9 rounded-full ${alert.enabled ? "bg-[#3ecf8e]" : "bg-[#3a4d68]"}`}
                  >
                    <span className={`block h-4 w-4 rounded-full bg-white transition ${alert.enabled ? "ml-4" : "ml-0.5"}`} />
                  </button>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded text-[#8b9bb4] hover:bg-[#2a3548] hover:text-white"
                    onClick={() => startEdit(alert)}
                    aria-label="edit"
                    title="Редактировать"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
                      <path d="M13.2 7.8 16.2 10.8 10 17H7v-3z" />
                    </svg>
                  </button>
                  <button className="text-[#8b9bb4]" onClick={() => remove(alert.id)} aria-label="delete">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-3 text-sm text-[#c5d0e0]">
            {history.length === 0 && <li className="text-center text-[#8b9bb4]">История пуста</li>}
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-[#8b9bb4]">{new Date(h.at).toLocaleString()} — </span>
                {h.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {settingsOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveSettings} className="w-full max-w-md space-y-3 rounded-xl bg-[#1a2332] p-5">
            <h2 className="text-lg font-medium">Каналы уведомлений</h2>
            <input
              className="field w-full"
              placeholder="Telegram bot token"
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
            />
            <input
              className="field w-full"
              placeholder="Telegram chat id"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
            />
            <input
              className="field w-full"
              placeholder="Discord webhook URL"
              value={discordWebhookUrl}
              onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="field" onClick={() => setSettingsOpen(false)}>
                Отмена
              </button>
              <button className="rounded-md bg-[#e85d8a] px-4 py-2 text-sm">Сохранить</button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <button
          className="fixed bottom-4 right-4 max-w-sm rounded-lg bg-[#222d3f] px-4 py-3 text-left text-sm shadow-lg"
          onClick={() => setToast("")}
        >
          {toast}
        </button>
      )}
    </main>
  );
}
