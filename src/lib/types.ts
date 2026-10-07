export type Channel = "telegram" | "discord" | "browser";
export type Direction = "above" | "below";
export type AlertKind = "price" | "percent";
export type Quote = "USDT" | "USDC" | "BTC";

export interface PriceAlert {
  id: string;
  kind: AlertKind;
  channel: Channel;
  symbol: string;
  quote: Quote;
  exchange: string;
  direction: Direction;
  targetPrice: number | null;
  percentChange: number | null;
  cooldownMinutes: number;
  note: string;
  oneShot: boolean;
  enabled: boolean;
  lastTriggeredAt: number | null;
  createdAt: number;
  baselinePrice: number | null;
}

export interface AlertHistoryItem {
  id: string;
  alertId: string;
  message: string;
  price: number;
  at: number;
}

export interface AppSettings {
  telegramBotToken: string;
  telegramChatId: string;
  discordWebhookUrl: string;
}

export interface AppData {
  alerts: PriceAlert[];
  history: AlertHistoryItem[];
  settings: AppSettings;
}

export interface CoinInfo {
  symbol: string;
  base: string;
  quote: string;
  exchange: string;
}
