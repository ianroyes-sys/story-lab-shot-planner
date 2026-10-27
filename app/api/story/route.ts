import { NextRequest, NextResponse } from "next/server";
import { guard, paths } from "@/lib/server";
import { storySources, listDrafts, readDraft, saveDraft, exportDraft } from "@/lib/drafts.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const p = paths();
  const id = req.nextUrl.searchParams.get("export");
  try {
    if (id) {
      const draft = readDraft(p.draftsDir, id);
      return new NextResponse(exportDraft(draft), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="story-${draft.id}.md"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ...storySources(p), drafts: listDrafts(p.draftsDir), generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }
}

async function save(req: NextRequest, update: boolean) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const raw = await req.text();
    if (raw.length > 60000) return NextResponse.json({ error: "Draft is too large." }, { status: 413 });
    const input = JSON.parse(raw);
    if (update && !input?.id) throw new Error("Choose a saved draft.");
    if (!update && input?.id) throw new Error("Use update for an existing draft.");
    const draft = saveDraft(input, { root: paths().draftsDir });
    return NextResponse.json({ draft }, { status: update ? 200 : 201 });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not save draft.";
    return NextResponse.json({ error }, { status: /another window/.test(error) ? 409 : 400 });
  }
}
export const POST = (req: NextRequest) => save(req, false);
export const PUT = (req: NextRequest) => save(req, true);
