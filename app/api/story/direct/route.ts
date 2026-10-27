import { NextRequest, NextResponse } from "next/server";
import { guard, paths } from "@/lib/server";
import { storySources } from "@/lib/drafts.mjs";
import { directorPrompt, runDirector } from "@/lib/director.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const raw = await req.text();
  if (raw.length > 18000) return NextResponse.json({ error: "Brief is too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body?.brief !== "string" || !body.brief.trim() || body.brief.length > 14000) return NextResponse.json({ error: "Describe the treatment first." }, { status: 400 });
  const { projects, stories } = storySources(paths());
  const source = [...projects, ...stories].find((s) => s.id === body.sourceId);
  if (body.sourceId && !source) return NextResponse.json({ error: "Source no longer exists. Choose another." }, { status: 400 });
  const text = await runDirector(directorPrompt({ source, brief: body.brief }));
  if (!text) return NextResponse.json({ error: "The AI director could not finish this pass. Your treatment is intact; check that the Claude Code CLI is installed and signed in, then retry." }, { status: 503 });
  return NextResponse.json({ text, sourceId: source?.id || null });
}
