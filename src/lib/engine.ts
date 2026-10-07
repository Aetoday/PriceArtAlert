import { randomUUID } from "crypto";
import { loadData, saveData } from "./store";
import { getPrice } from "./prices";
import { formatAlertMessage, sendNotification } from "./notify";
import type { PriceAlert } from "./types";

function shouldFire(alert: PriceAlert, price: number) {
  if (!alert.enabled) return false;
  if (alert.lastTriggeredAt && Date.now() - alert.lastTriggeredAt < alert.cooldownMinutes * 60_000) {
    return false;
  }

  if (alert.kind === "percent") {
    if (!alert.baselinePrice || !alert.percentChange) return false;
    const change = ((price - alert.baselinePrice) / alert.baselinePrice) * 100;
    if (alert.direction === "above") return change >= alert.percentChange;
    return change <= -alert.percentChange;
  }

  if (alert.targetPrice == null) return false;
  if (alert.direction === "above") return price >= alert.targetPrice;
  return price <= alert.targetPrice;
}

export async function checkAlerts() {
  const data = await loadData();
  const fired: Array<{ alert: PriceAlert; price: number; message: string }> = [];

  for (const alert of data.alerts) {
    if (!alert.enabled) continue;
    try {
      const price = await getPrice(alert.exchange, alert.symbol, alert.quote);
      if (alert.kind === "percent" && !alert.baselinePrice) {
        alert.baselinePrice = price;
        continue;
      }
      if (!shouldFire(alert, price)) continue;

      const message = formatAlertMessage(alert, price);
      alert.lastTriggeredAt = Date.now();
      if (alert.oneShot) alert.enabled = false;

      if (alert.channel !== "browser") {
        try {
          await sendNotification(alert.channel, message, data.settings);
        } catch (err) {
          console.error("notify failed", err);
        }
      }

      data.history.unshift({
        id: randomUUID(),
        alertId: alert.id,
        message,
        price,
        at: Date.now(),
      });
      data.history = data.history.slice(0, 200);
      fired.push({ alert, price, message });
    } catch (err) {
      console.error("check failed", alert.symbol, err);
    }
  }

  await saveData(data);
  return fired;
}

let loopStarted = false;

export function startAlertLoop() {
  if (loopStarted) return;
  loopStarted = true;
  const tick = async () => {
    try {
      await checkAlerts();
    } catch (err) {
      console.error(err);
    }
  };
  void tick();
  setInterval(tick, 12_000);
}
