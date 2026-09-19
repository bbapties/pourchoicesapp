import { NextResponse } from "next/server";
import { adminClient } from "@/lib/push-server";

/**
 * #138: the nightly backstop. Re-runs the badge engine for everyone (the client already runs it
 * per person after each action; this catches anything that happened by SQL, by the bots, or
 * while a phone was offline). Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`
 * (vercel.json); it refuses everything else. Nothing here sends a push - award_badges_all only
 * updates rows; the moment is a client concern.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "No service role" }, { status: 503 });
  const { data, error } = await admin.rpc("award_badges_all");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}
