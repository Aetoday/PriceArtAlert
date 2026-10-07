import { NextResponse } from "next/server";
import { checkAlerts } from "@/lib/engine";

export async function POST() {
  const fired = await checkAlerts();
  return NextResponse.json({ fired });
}

export async function GET() {
  const fired = await checkAlerts();
  return NextResponse.json({ fired });
}
