import { NextResponse } from "next/server";
import { listBinanceCoins } from "@/lib/prices";

export async function GET() {
  try {
    return NextResponse.json(await listBinanceCoins());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Coins error" },
      { status: 502 },
    );
  }
}
