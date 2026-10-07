import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";

export async function GET() {
  const s = await getSettings();
  return NextResponse.json({
    telegramBotToken: s.telegramBotToken ? "••••" : "",
    telegramChatId: s.telegramChatId,
    discordWebhookUrl: s.discordWebhookUrl ? "••••" : "",
    hasTelegram: Boolean(s.telegramBotToken && s.telegramChatId),
    hasDiscord: Boolean(s.discordWebhookUrl),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const current = await getSettings();
  const next = {
    telegramBotToken:
      body.telegramBotToken && body.telegramBotToken !== "••••"
        ? String(body.telegramBotToken)
        : current.telegramBotToken,
    telegramChatId: body.telegramChatId ?? current.telegramChatId,
    discordWebhookUrl:
      body.discordWebhookUrl && body.discordWebhookUrl !== "••••"
        ? String(body.discordWebhookUrl)
        : current.discordWebhookUrl,
  };
  await saveSettings(next);
  return NextResponse.json({ ok: true });
}
