import { NextResponse } from "next/server";
import { getPrice } from "@/lib/prices";
import type { Quote } from "@/lib/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase();
  const quote = (searchParams.get("quote") ?? "USDT") as Quote;
  const exchange = searchParams.get("exchange") ?? "Binance";
  try {
    const price = await getPrice(exchange, symbol, quote);
    return NextResponse.json({ symbol, quote, exchange, price });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Price error" },
      { status: 400 },
    );
  }
}
