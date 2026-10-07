import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { AppData, AppSettings, PriceAlert, AlertHistoryItem } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "app.json");

const defaultSettings: AppSettings = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
};

const empty: AppData = {
  alerts: [],
  history: [],
  settings: defaultSettings,
};

async function ensure() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function loadData(): Promise<AppData> {
  await ensure();
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as AppData;
    return {
      alerts: parsed.alerts ?? [],
      history: parsed.history ?? [],
      settings: { ...defaultSettings, ...parsed.settings },
    };
  } catch {
    return structuredClone(empty);
  }
}

export async function saveData(data: AppData) {
  await ensure();
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function listAlerts() {
  const data = await loadData();
  return data.alerts.sort((a, b) => b.createdAt - a.createdAt);
}

export async function upsertAlert(alert: PriceAlert) {
  const data = await loadData();
  const idx = data.alerts.findIndex((a) => a.id === alert.id);
  if (idx >= 0) data.alerts[idx] = alert;
  else data.alerts.push(alert);
  await saveData(data);
  return alert;
}

export async function patchAlert(id: string, patch: Partial<PriceAlert>) {
  const data = await loadData();
  const idx = data.alerts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  data.alerts[idx] = { ...data.alerts[idx], ...patch, id };
  await saveData(data);
  return data.alerts[idx];
}

export async function removeAlert(id: string) {
  const data = await loadData();
  data.alerts = data.alerts.filter((a) => a.id !== id);
  await saveData(data);
}

export async function addHistory(item: AlertHistoryItem) {
  const data = await loadData();
  data.history.unshift(item);
  data.history = data.history.slice(0, 200);
  await saveData(data);
}

export async function listHistory() {
  const data = await loadData();
  return data.history;
}

export async function getSettings() {
  const data = await loadData();
  return data.settings;
}

export async function saveSettings(settings: AppSettings) {
  const data = await loadData();
  data.settings = settings;
  await saveData(data);
  return settings;
}
