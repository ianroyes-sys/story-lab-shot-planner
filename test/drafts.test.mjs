import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { storySources, saveDraft, readDraft, listDrafts, exportDraft } from "../lib/drafts.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "story-lab-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, data) => { const p = path.join(root, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data)); };
  return { root, write, drafts: path.join(root, "drafts") };
}
const story = { kind: "story", title: "A build worth filming", payload: { version: 1, intent: "process", destination: "studio", hook: "What actually broke?", businessUnlock: "Show how the work gets done", cta: "See the demo", broll: "Capture the working screen", directorNotes: "Proposed, not captured", beats: [{ id: "a", title: "The problem", shot: "close", seconds: 7, cue: "Capture the actual issue", captured: false }, { id: "b", title: "The turn", shot: "wide", seconds: 8, cue: "Show the fix", captured: false }] } };

test("a saved story survives reload and export without touching its sources", (t) => {
  const f = fixture(t);
  f.write("sources/projects.json", [{ name: "Demo", status: "building" }]);
  const before = fs.readFileSync(path.join(f.root, "sources/projects.json"), "utf8");
  const d = saveDraft(story, { root: f.drafts });
  assert.deepEqual(readDraft(f.drafts, d.id), d);
  assert.equal(d.revision, 1);
  assert.match(exportDraft(d), /Draft for review/);
  assert.equal(listDrafts(f.drafts).length, 1);
  assert.equal(fs.readFileSync(path.join(f.root, "sources/projects.json"), "utf8"), before);
});

test("optimistic revisions prevent overwriting another saved edit", (t) => {
  const f = fixture(t);
  const d = saveDraft(story, { root: f.drafts });
  const updated = saveDraft({ ...d, title: "Revised" }, { root: f.drafts });
  assert.equal(updated.revision, 2);
  assert.throws(() => saveDraft({ ...d, title: "Stale" }, { root: f.drafts }), /another window/);
  assert.equal(readDraft(f.drafts, d.id).title, "Revised");
});

test("duplicate shots, empty sequences and path traversal are rejected", (t) => {
  const f = fixture(t);
  assert.throws(() => saveDraft({ ...story, payload: { ...story.payload, beats: [story.payload.beats[0], story.payload.beats[0]] } }, { root: f.drafts }), /unique/);
  assert.throws(() => readDraft(f.drafts, "../../file"), /Invalid/);
  assert.throws(() => saveDraft({ ...story, payload: { ...story.payload, beats: [] } }, { root: f.drafts }), /1–30/);
  assert.throws(() => saveDraft({ ...story, payload: { ...story.payload, destination: "elsewhere" } }, { root: f.drafts }), /destination/);
});

test("shot export preserves sequence, timing, and captured status", (t) => {
  const f = fixture(t);
  const md = exportDraft(saveDraft(story, { root: f.drafts }));
  assert.match(md, /0–7s/);
  assert.match(md, /7–15s/);
  assert.match(md, /Total planned runtime: 15s/);
  assert.match(md, /Planned; not yet captured/);
});

test("malformed story values and unsafe source links cannot enter saved drafts", (t) => {
  const f = fixture(t);
  for (const change of [{ hook: {} }, { directorNotes: [] }, { source: { id: "x", title: "x", summary: "x", href: "javascript:alert(1)", kind: "idea", source: "test" } }])
    assert.throws(() => saveDraft({ ...story, payload: { ...story.payload, ...change } }, { root: f.drafts }), /Invalid/);
  assert.equal(listDrafts(f.drafts).length, 0);
});

test("sources: projects, live ideas only, and the newest non-idle receipt per loop", (t) => {
  const f = fixture(t);
  f.write("sources/projects.json", [{ name: "Pocket Menu", status: "prototype", tagline: "Weekend build", url: "javascript:bad" }]);
  f.write("sources/ideas.json", { ideas: [{ id: "x", title: "Working idea", body: "Could film this", status: "inbox" }, { id: "y", title: "Cut", status: "cut" }] });
  f.write("receipts/sweeper/2026-01-02.md", "STATUS: nothing-to-do\n");
  f.write("receipts/sweeper/2026-01-01.md", "STATUS: ok\nDID: fixed the date bug\n");
  const s = storySources({ sourcesDir: path.join(f.root, "sources"), receiptsDir: path.join(f.root, "receipts") });
  assert.deepEqual(s.projects.map((p) => [p.id, p.href]), [["project:pocket-menu", "/"]]);
  assert.deepEqual(s.stories.map((x) => x.kind), ["idea", "receipt"]);
  assert.equal(s.stories[1].summary, "fixed the date bug");
  assert.equal(s.stories[1].title, "sweeper · ok");
});

test("the bundled sample sources load", () => {
  const s = storySources({ sourcesDir: new URL("../data/sources", import.meta.url).pathname, receiptsDir: new URL("../examples/receipts", import.meta.url).pathname });
  assert.equal(s.projects.length, 2);
  assert.equal(s.stories.length, 2);
});
