import { NextResponse } from "next/server";
import { checkAlerts } from "@/lib/engine";
import { checkAnnouncements } from "@/lib/announcements";

async function runChecks() {
  const fired = await checkAlerts();
  try {
    await checkAnnouncements();
  } catch (err) {
    console.error("delist check failed", err);
  }
  return fired;
}

export async function POST() {
  const fired = await runChecks();
  return NextResponse.json({ fired });
}

export async function GET() {
  const fired = await runChecks();
  return NextResponse.json({ fired });
}
