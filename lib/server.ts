import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const paths = () => ({
  sourcesDir: path.resolve(process.env.STORY_LAB_SOURCES || "data/sources"),
  receiptsDir: process.env.STORY_LAB_RECEIPTS ? path.resolve(process.env.STORY_LAB_RECEIPTS) : undefined,
  draftsDir: path.resolve(process.env.STORY_LAB_DRAFTS || "data/drafts"),
});

/** Story Lab is a local tool. Writes must come from this origin, and if STORY_LAB_KEY is set,
 *  every request needs it as an `x-story-lab-key` header or `story_lab_key` cookie. */
export function guard(req: NextRequest) {
  const key = process.env.STORY_LAB_KEY;
  if (key && req.cookies.get("story_lab_key")?.value !== key && req.headers.get("x-story-lab-key") !== key) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin && origin !== req.nextUrl.origin && origin !== `${req.nextUrl.protocol}//${req.headers.get("host")}`) {
    return NextResponse.json({ error: "cross-origin" }, { status: 403 });
  }
  return null;
}
