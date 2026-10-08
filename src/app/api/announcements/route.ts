import { NextResponse } from "next/server";
import { checkAnnouncements, getAnnouncementStatus } from "@/lib/announcements";

export async function GET() {
  return NextResponse.json(await getAnnouncementStatus());
}

export async function POST() {
  try {
    const result = await checkAnnouncements(true);
    const status = await getAnnouncementStatus();
    return NextResponse.json({ ...status, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "check failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
