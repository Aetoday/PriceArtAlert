import type { AppSettings, Channel, PriceAlert } from "./types";

export function formatAlertMessage(alert: PriceAlert, price: number) {
  const verb = alert.kind === "percent" ? "изменился на" : alert.direction === "above" ? "выше" : "ниже";
  const target =
    alert.kind === "percent"
      ? `${alert.percentChange}%`
      : `${alert.targetPrice} ${alert.quote}`;
  const note = alert.note ? `\nЗаметка: ${alert.note}` : "";
  return `PriceArtAlert: ${alert.symbol} сейчас ${price} ${alert.quote} (${verb} ${target}) на ${alert.exchange}.${note}`;
}

export async function sendNotification(
  channel: Channel,
  message: string,
  settings: AppSettings,
) {
  if (channel === "telegram") {
    const token = settings.telegramBotToken;
    const chat = settings.telegramChatId;
    if (!token || !chat) throw new Error("Не заданы Telegram bot token и chat id");
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: message }),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}`);
    return;
  }

  if (channel === "discord") {
    const url = settings.discordWebhookUrl;
    if (!url) throw new Error("Не задан Discord webhook");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    if (!res.ok) throw new Error(`Discord ${res.status}`);
  }
}
