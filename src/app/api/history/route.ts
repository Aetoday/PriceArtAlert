import { NextResponse } from "next/server";
import { listHistory } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await listHistory());
}
