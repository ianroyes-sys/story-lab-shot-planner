// Story sources and saved treatments, stored as local JSON files.
//
// Sources are read-only inputs (projects you've built, video ideas, agent-run receipts).
// Drafts are the only thing Story Lab writes: one JSON file per treatment, written
// atomically, with an optimistic revision number so two windows can't silently overwrite
// each other.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { INTENTS, DESTINATIONS } from "./treatment.mjs";

const clip = (value, n = 1000) => String(value ?? "").trim().slice(0, n);
const slug = (value) => clip(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const validId = (id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
function read(file) { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } }
function json(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
const array = (value) => (Array.isArray(value) ? value : []);
/** Only same-site paths or http(s) URLs survive; anything else (javascript:, data:) is dropped. */
export const safeHref = (value) => (typeof value === "string" && (/^\/(?!\/)/.test(value) || /^https?:\/\//.test(value)) ? value : "/");

/**
 * Sources, all optional:
 *   <sources>/projects.json  [{ name, status, tagline, url }]
 *   <sources>/ideas.json     { ideas: [{ id, title, body, status, added, source }] }   (cut/posted are skipped)
 *   <receipts>/<loop>/<run>.md  agent-run receipts with STATUS:/DID: lines; the newest
 *                               non-idle run per loop becomes a story seed
 */
export function storySources({ sourcesDir, receiptsDir } = {}) {
  const projects = array(json(path.join(sourcesDir, "projects.json"), []))
    .filter((p) => p && p.name)
    .map((p) => ({ id: `project:${slug(p.name)}`, name: clip(p.name, 160), kind: "build", status: clip(p.status, 80), description: clip(p.tagline, 500), href: safeHref(p.url || "/"), source: "projects.json" }));
  const stories = array(json(path.join(sourcesDir, "ideas.json"), {})?.ideas)
    .filter((i) => i?.id && !["cut", "posted"].includes(i.status))
    .map((i) => ({ id: `idea:${i.id}`, title: clip(i.title, 180), summary: clip(i.body, 1200), source: `ideas.json · ${i.added || "undated"} · ${i.source || "idea"}`, href: "/", kind: "idea" }));
  const runs = [];
  if (receiptsDir) {
    let loops = [];
    try { loops = fs.readdirSync(receiptsDir); } catch {}
    for (const name of loops) {
      let files = [];
      try { files = fs.readdirSync(path.join(receiptsDir, name)).filter((f) => f.endsWith(".md")).sort().reverse().slice(0, 5); } catch {}
      for (const file of files) {
        const body = read(path.join(receiptsDir, name, file));
        const status = [...body.matchAll(/^STATUS:[ \t]*(.+)$/gm)].at(-1)?.[1]?.trim();
        if (!status || ["idle", "nothing-to-do", "stopped"].includes(status)) continue;
        const did = [...body.matchAll(/^DID:[ \t]*(.+)$/gm)].at(-1)?.[1];
        const excerpt = did || body.replace(/^---[\s\S]*?---\s*/, "").split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("<!--")).slice(0, 4).join(" ");
        runs.push({ id: `receipt:${name}:${file}`, title: `${name.replace(/-/g, " ")} · ${status}`, summary: clip(excerpt, 1100), source: `receipts/${name}/${file}`, href: "/", kind: "receipt", stamp: file });
        break;
      }
    }
  }
  stories.push(...runs.sort((a, b) => b.stamp.localeCompare(a.stamp)).map(({ stamp, ...story }) => story));
  return { projects, stories };
}

function draftPath(root, id) {
  if (!validId(id)) throw new Error("Invalid draft ID.");
  return path.join(root, `${id}.json`);
}

export function readDraft(root, id) {
  const d = json(draftPath(root, id), null);
  if (!d || d.id !== id || d.kind !== "story" || typeof d.title !== "string" || !Number.isInteger(d.revision) || d.revision < 1 || !d.payload || typeof d.updatedAt !== "string" || typeof d.createdAt !== "string") throw new Error("Draft not found or damaged.");
  validateDraft(d);
  return d;
}

export function listDrafts(root) {
  let files = [];
  try { files = fs.readdirSync(root).filter((f) => f.endsWith(".json")); } catch {}
  return files
    .map((f) => { try { return readDraft(root, f.slice(0, -5)); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function validateDraft(input) {
  if (typeof input?.title !== "string" || !input.title.trim() || input.title.length > 200) throw new Error("Give the draft a title of 1–200 characters.");
  const payload = input.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || JSON.stringify(payload).length > 50000) throw new Error("Draft content is missing or too large.");
  if (payload.version !== 1) throw new Error("Unsupported draft version.");
  const textField = (object, key, limit, optional = false) => {
    if (optional && object[key] === undefined) return;
    if (typeof object[key] !== "string" || object[key].length > limit) throw new Error(`Invalid draft ${key}.`);
  };
  if (!INTENTS.includes(payload.intent) || !Object.hasOwn(DESTINATIONS, payload.destination)) throw new Error("Choose a valid story intention and destination.");
  if (!Array.isArray(payload.beats) || payload.beats.length < 1 || payload.beats.length > 30) throw new Error("Use 1–30 story beats.");
  for (const b of payload.beats) {
    if (!b || typeof b.id !== "string" || typeof b.title !== "string" || typeof b.cue !== "string" || typeof b.shot !== "string" || !Number.isFinite(b.seconds) || b.seconds < 1 || b.seconds > 3600) throw new Error("Each beat needs a title, shot, cue and positive duration.");
    if (!b.id || b.id.length > 200 || b.title.length > 500 || b.cue.length > 5000 || b.shot.length > 200 || typeof b.captured !== "boolean") throw new Error("Invalid story beat fields.");
  }
  if (new Set(payload.beats.map((b) => b.id)).size !== payload.beats.length) throw new Error("Story beat IDs must be unique.");
  for (const key of ["hook", "businessUnlock", "cta", "broll"]) textField(payload, key, 5000);
  textField(payload, "directorNotes", 20000, true);
  if (payload.source !== undefined && payload.source !== null) {
    if (typeof payload.source !== "object" || Array.isArray(payload.source)) throw new Error("Invalid story source.");
    for (const key of ["id", "title", "summary", "href", "kind", "source"]) textField(payload.source, key, 5000);
    if (safeHref(payload.source.href) !== payload.source.href) throw new Error("Invalid story source link.");
  }
  return { kind: "story", title: input.title.trim(), sourceId: typeof input.sourceId === "string" ? input.sourceId.slice(0, 300) : null, payload: JSON.parse(JSON.stringify(payload)) };
}

export function saveDraft(input, { root, now = new Date() }) {
  const old = input?.id ? readDraft(root, input.id) : null;
  if (old && input.revision !== old.revision) throw new Error("Draft changed in another window. Reload before saving.");
  const fields = validateDraft(input);
  const id = old?.id || randomUUID();
  const draft = { id, ...fields, sourceId: fields.sourceId || old?.sourceId || null, createdAt: old?.createdAt || now.toISOString(), updatedAt: now.toISOString(), revision: (old?.revision || 0) + 1 };
  const file = draftPath(root, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(draft, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return draft;
}

/** A saved treatment as a shoot brief: timecoded shot plan, capture status, source note. */
export function exportDraft(draft) {
  const p = draft.payload;
  const out = [`# ${draft.title}`, "", `Story treatment · saved ${draft.updatedAt}`, "Draft for review. No publication or factual outcome is implied.", "", `Intent: ${p.intent} · Destination: ${p.destination}`, "", "## Hook", clip(p.hook, 3000), "", "## Business connection", clip(p.businessUnlock, 3000), "", "## Shot plan"];
  let elapsed = 0;
  for (const [i, b] of p.beats.entries()) {
    out.push(`\n### ${i + 1}. ${b.title} · ${elapsed}–${elapsed + b.seconds}s`, `${b.shot} · ${b.captured ? "Marked captured" : "Planned; not yet captured"}`, b.cue);
    elapsed += b.seconds;
  }
  out.push("", `Total planned runtime: ${elapsed}s`, "", "## B-roll", clip(p.broll, 5000), "", "## Call to action", clip(p.cta, 3000));
  if (p.directorNotes) out.push("", "## Director notes", clip(p.directorNotes, 20000));
  if (p.source) out.push("", "## Source material", `${clip(p.source.title)} — ${clip(p.source.source)}`, clip(p.source.summary, 2000), "Verify source claims before publishing. Proposed scenes are not records of events.");
  return out.join("\n") + "\n";
}
