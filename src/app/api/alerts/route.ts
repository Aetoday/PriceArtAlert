import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { listAlerts, upsertAlert } from "@/lib/store";
import { getPrice } from "@/lib/prices";
import type { PriceAlert } from "@/lib/types";

export async function GET() {
  return NextResponse.json(await listAlerts());
}

export async function POST(req: Request) {
  const body = await req.json();
  const alert: PriceAlert = {
    id: randomUUID(),
    kind: body.kind ?? "price",
    channel: body.channel ?? "browser",
    symbol: String(body.symbol ?? "BTC").toUpperCase(),
    quote: body.quote ?? "USDT",
    exchange: body.exchange ?? "Binance",
    direction: body.direction ?? "above",
    targetPrice: body.targetPrice == null ? null : Number(body.targetPrice),
    percentChange: body.percentChange == null ? null : Number(body.percentChange),
    cooldownMinutes: Number(body.cooldownMinutes ?? 60),
    note: String(body.note ?? ""),
    oneShot: Boolean(body.oneShot),
    enabled: true,
    lastTriggeredAt: null,
    createdAt: Date.now(),
    baselinePrice: null,
  };

  if (alert.kind === "percent") {
    try {
      alert.baselinePrice = await getPrice(alert.exchange, alert.symbol, alert.quote);
    } catch {
      alert.baselinePrice = null;
    }
  }

  await upsertAlert(alert);
  return NextResponse.json(alert, { status: 201 });
}
