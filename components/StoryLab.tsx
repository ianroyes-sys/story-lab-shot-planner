"use client";

import { useEffect, useState } from "react";
import "./StoryLab.css";
import { DESTINATIONS, createTreatment, treatmentMarkdown, runtime } from "../lib/treatment.mjs";

type Source = { id: string; title: string; summary: string; source: string; href: string; kind: string };
type Beat = { id: string; title: string; shot: string; seconds: number; cue: string; captured: boolean };
type Treatment = { version: 1; intent: "proof" | "process" | "position"; destination: "studio" | "newsletter" | "portfolio"; hook: string; businessUnlock: string; cta: string; beats: Beat[]; broll: string; source: Source | null; directorNotes?: string };
type Draft = { id: string; title: string; kind: string; revision: number; payload: Treatment };
const destinations = Object.fromEntries(Object.entries(DESTINATIONS).map(([k, v]) => [k, v.label])) as Record<Treatment["destination"], string>;
const ctas = Object.fromEntries(Object.entries(DESTINATIONS).map(([k, v]) => [k, v.cta])) as Record<Treatment["destination"], string>;
const uid = () => crypto.randomUUID();
const treatment = (source: Source | null): Treatment => createTreatment(source, "proof", "studio", uid) as Treatment;
const markdown = (title: string, value: Treatment): string => treatmentMarkdown(title, value);

export default function StoryLab() {
  const [sources, setSources] = useState<Source[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [value, setValue] = useState<Treatment | null>(null);
  const [title, setTitle] = useState("Untitled build story");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [directing, setDirecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [shooting, setShooting] = useState(false);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/story", { cache: "no-store" });
      if (!response.ok) throw new Error("Story sources could not load. Your open treatment is still here.");
      const data = await response.json();
      const stories: Source[] = [...(data.stories || []), ...(data.projects || []).map((project: { id: string; name: string; description: string; status: string; href: string; source: string }) => ({ id: project.id, title: project.name, summary: `${project.description || ""} · Recorded status: ${project.status || "unknown"}. Verify current behavior before filming.`, href: project.href, source: project.source, kind: "build" }))];
      setSources(stories); setDrafts((data.drafts || []).filter((d: Draft) => d.kind === "story" && d.payload?.version === 1));
      const requested = new URLSearchParams(window.location.search).get("draft");
      const existing = (data.drafts || []).find((d: Draft) => d.id === requested && d.kind === "story" && d.payload?.version === 1);
      if (existing && !value) { setValue(existing.payload); setTitle(existing.title); setDraftId(existing.id); setRevision(existing.revision); return; }
      const requestedSource = new URLSearchParams(window.location.search).get("source");
      const source = !requested && stories.find(s => s.id === requestedSource);
      if (source && !value) { setValue(treatment(source)); setTitle(source.title); return; }
      setValue(previous => previous || treatment(stories[0] || null));
      setTitle(previous => previous === "Untitled build story" && stories[0] ? stories[0].title : previous);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load Story Lab."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!playing || !value) return;
    const timer = window.setInterval(() => setElapsed(n => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing, value]);
  useEffect(() => {
    if (!playing || !value || elapsed < value.beats[active].seconds) return;
    setElapsed(0);
    if (active < value.beats.length - 1) setActive(n => n + 1); else setPlaying(false);
  }, [elapsed, active, playing, value]);
  function edit(patch: Partial<Treatment>) { setValue(v => v ? { ...v, ...patch } : v); setDirty(true); setMessage(""); }
  function editBeat(id: string, patch: Partial<Beat>) { if (value) edit({ beats: value.beats.map(b => b.id === id ? { ...b, ...patch } : b) }); }
  function selectSource(source: Source | null) {
    if (directing || saving) { setMessage("Finish the current save or direction before switching treatments."); return; }
    if (dirty && !window.confirm("Start a new treatment? Unsaved changes in this treatment will be lost.")) return;
    setValue(treatment(source)); setTitle(source?.title || "Untitled build story"); setDraftId(null); setRevision(null); setDirty(true); setActive(0); setElapsed(0); setPlaying(false); setMessage("");
  }
  function move(index: number, direction: number) {
    if (!value) return;
    const beats = [...value.beats]; [beats[index], beats[index + direction]] = [beats[index + direction], beats[index]];
    edit({ beats }); setPlaying(false); setElapsed(0);
  }
  async function save() {
    if (!value || directing || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/story", { method: draftId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(draftId ? { id: draftId, revision: drafts.find(d => d.id === draftId)?.revision ?? revision } : { kind: "story", sourceId: value.source?.id }), title, payload: value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save the treatment.");
      const draft: Draft = data.draft || data;
      setDraftId(draft.id); setRevision(draft.revision); setDrafts(list => [draft, ...list.filter(d => d.id !== draft.id)]); setDirty(false); setMessage("Shoot brief saved. Ready when you are.");
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed. Your edits are still here."); }
    finally { setSaving(false); }
  }
  function download() {
    if (!value) return;
    const url = URL.createObjectURL(new Blob([markdown(title, value) + (value.directorNotes ? `\n## AI director notes — proposed treatment\n${value.directorNotes}\n` : "")], { type: "text/markdown" }));
    const a = document.createElement("a"); a.href = url; a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80) || "story"}-shoot-brief.md`; a.click(); URL.revokeObjectURL(url);
    setMessage("Shoot brief exported, including your current edits.");
  }
  async function direct() {
    if (!value) return;
    setDirecting(true); setError(""); setMessage("The AI director is reading the source and this treatment…");
    try {
      const response = await fetch("/api/story/direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: value.source?.id, brief: markdown(title, value) }) });
      const data = await response.json();
      if (!response.ok || !data.text) throw new Error(data.error || "The AI director could not return notes. Your treatment is still editable.");
      edit({ directorNotes: data.text }); setMessage("Director notes are ready below. Review them, make them yours, then save.");
    } catch (e) { setMessage(""); setError(e instanceof Error ? e.message : "Direction failed. Try again."); }
    finally { setDirecting(false); }
  }
  const total = value?.beats.reduce((n, b) => n + b.seconds, 0) || 0;
  const captured = value?.beats.filter(b => b.captured).length || 0;
  const current = value?.beats[active];
  const filtered = sources.filter(s => `${s.title} ${s.kind} ${s.summary}`.toLowerCase().includes(query.toLowerCase()));

  return <section className={`story-lab ${shooting ? "sl-shooting" : ""}`} aria-label="Story Lab">
    <header className="sl-header"><div><span className="sl-kicker">STORY LAB</span><h2>the work is<br /><em>the story.</em></h2><p>Your builds, your receipts, your point of view.<br />Turn something real into something worth watching.</p></div><div className="sl-slate" aria-label="Story direction"><div className="sl-clapper" /><span>BUILD IN PUBLIC</span><strong>capture it.</strong><div><span>PICTURE / real work</span><span>SOUND / your voice</span></div></div></header>
    <div className="sl-toolbar"><span className="sl-kicker">TREATMENT DESK <span className="sl-muted">/ {value ? runtime(total) : "—"} PLANNED</span></span><div><button onClick={() => { setShooting(!shooting); setPlaying(false); setElapsed(0); }}>{shooting ? "← Back to editing" : "◉ Shoot mode"}</button><button onClick={download} disabled={!value}>Export brief ↗</button><button className="sl-primary" onClick={save} disabled={!value || saving || !title.trim()}>{saving ? "Saving…" : dirty ? "Save shoot brief •" : "Save shoot brief"}</button></div></div>
    {error && <div className="sl-notice" role="alert">{error} <button onClick={load}>Retry sources</button></div>}
    <p className="sl-status" role="status">{message || (dirty ? "Unsaved treatment · save before leaving the room." : "Treatments are proposed scenes. Source ideas and receipts stay attached.")}</p>
    <fieldset disabled={saving || directing} style={{ minWidth: 0 }}>
    {loading && !value ? <div className="sl-empty">Opening the story desk…</div> : !value ? <div className="sl-empty"><p>Start with your own story while sources are unavailable.</p><button onClick={() => selectSource(null)}>Create a blank treatment</button></div> : <div className="sl-layout">
      {!shooting && <aside className="sl-sources"><div className="sl-section-heading"><h3>Start with the real thing</h3><span>{sources.length} seeds</span></div><label className="sl-search"><span className="sr-only">Search story seeds</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a build, idea, receipt…" /></label><div className="sl-source-list">{filtered.map(source => <button key={source.id} className={`sl-seed ${value.source?.id === source.id ? "is-selected" : ""}`} onClick={() => selectSource(source)}><span>{source.kind} <i>↗</i></span><strong>{source.title}</strong><p>{source.summary}</p></button>)}{!filtered.length && <p className="sl-muted">No matching seeds. Try another search or start your own.</p>}</div><button className="sl-new" onClick={() => selectSource(null)}>+ Start an original treatment</button>{drafts.length > 0 && <div className="sl-drafts"><h3>Saved shoot briefs</h3>{drafts.map(d => <button key={d.id} onClick={() => { if (dirty && !window.confirm("Open this saved brief? Unsaved edits will be lost.")) return; setValue(d.payload); setTitle(d.title); setDraftId(d.id); setDirty(false); setActive(0); setPlaying(false); setElapsed(0); setMessage("Saved brief opened."); }}>{d.title}<span>↗</span></button>)}</div>}</aside>}
      <div className="sl-editor">
        {!shooting && <><label className="sl-title"><span>TREATMENT TITLE</span><input maxLength={200} value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} /></label><div className="sl-options"><label>What it does<select value={value.intent} onChange={e => edit({ intent: e.target.value as Treatment["intent"] })}><option value="proof">Proof · credibility</option><option value="process">Process · trust</option><option value="position">Position · memory</option></select></label><label>Where it points<select value={value.destination} onChange={e => edit({ destination: e.target.value as Treatment["destination"], cta: ctas[e.target.value as Treatment["destination"]] })}>{Object.entries(destinations).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><label className="sl-field">The opening question<textarea value={value.hook} onChange={e => edit({ hook: e.target.value })} rows={2} /></label><label className="sl-field">The business unlock<textarea value={value.businessUnlock} onChange={e => edit({ businessUnlock: e.target.value })} rows={2} /></label>{value.source && <details className="sl-provenance"><summary>Source attached · {value.source.kind}</summary><strong>{value.source.title}</strong><p>{value.source.summary}</p><span>{value.source.source}</span>{value.source.href && <a href={value.source.href}>Open original ↗</a>}</details>}</>}
        <div className="sl-section-heading"><h3>{shooting ? "Today's shot list" : "Build the sequence"}</h3><span>{captured}/{value.beats.length} captured · {runtime(total)}</span></div>
        <div className="sl-timeline" aria-label="Scene runtime timeline">{value.beats.map((beat, i) => <button key={beat.id} style={{ flex: beat.seconds }} className={active === i ? "is-active" : ""} onClick={() => { setActive(i); setElapsed(0); setPlaying(false); }} aria-label={`Preview scene ${i + 1}: ${beat.title}, ${beat.seconds} seconds`}><span>{String(i + 1).padStart(2, "0")}</span></button>)}</div>
        {shooting && current && <div className="sl-cue"><span className="sl-kicker">DIRECTOR'S CUE / {String(active + 1).padStart(2, "0")} OF {value.beats.length}</span><h3>{current.title}</h3><div className="sl-cue-meta"><span>{current.shot}</span><strong>{runtime(Math.max(0, current.seconds - elapsed))}</strong></div><p>{current.cue}</p><div className="sl-cue-actions"><button disabled={active === 0} onClick={() => { setActive(n => n - 1); setElapsed(0); setPlaying(false); }}>← Previous</button><button className="sl-primary" onClick={() => setPlaying(!playing)}>{playing ? "Pause rehearsal" : "Rehearse timing"}</button><button disabled={active === value.beats.length - 1} onClick={() => { setActive(n => n + 1); setElapsed(0); setPlaying(false); }}>Next →</button></div><label className="sl-captured"><input type="checkbox" checked={current.captured} onChange={e => editBeat(current.id, { captured: e.target.checked })} /> Captured this shot</label><small>Rehearsal timer only. Mark a shot captured after filming it.</small></div>}
        <div className="sl-beats">{value.beats.map((beat, i) => <article key={beat.id} className={`sl-beat ${beat.captured ? "is-captured" : ""}`}><span className="sl-beat-number">{String(i + 1).padStart(2, "0")}</span><div className="sl-beat-content">{shooting ? <button className="sl-shot-pick" onClick={() => { setActive(i); setElapsed(0); setPlaying(false); }}>{beat.title}<span>{beat.shot} · {beat.seconds}s {beat.captured ? "✓" : ""}</span></button> : <><input aria-label={`Scene ${i + 1} title`} value={beat.title} onChange={e => editBeat(beat.id, { title: e.target.value })} /><textarea aria-label={`Scene ${i + 1} direction`} rows={3} value={beat.cue} onChange={e => editBeat(beat.id, { cue: e.target.value })} /><div className="sl-beat-controls"><select aria-label={`Scene ${i + 1} shot type`} value={beat.shot} onChange={e => editBeat(beat.id, { shot: e.target.value })}>{["Close-up", "To camera", "Screen recording", "Wide", "Detail", "Handheld", "Voiceover", "Natural sound"].map(shot => <option key={shot}>{shot}</option>)}</select><label><input aria-label={`Scene ${i + 1} duration in seconds`} type="number" min={1} max={600} value={beat.seconds} onChange={e => editBeat(beat.id, { seconds: Math.max(1, Math.min(600, Number(e.target.value) || 1)) })} /> sec</label><button disabled={i === 0} aria-label={`Move scene ${i + 1} up`} onClick={() => move(i, -1)}>↑</button><button disabled={i === value.beats.length - 1} aria-label={`Move scene ${i + 1} down`} onClick={() => move(i, 1)}>↓</button><button disabled={value.beats.length === 1} aria-label={`Remove scene ${i + 1}`} onClick={() => { edit({ beats: value.beats.filter(b => b.id !== beat.id) }); setActive(0); setPlaying(false); setElapsed(0); }}>×</button></div></>}</div></article>)}</div>
        {!shooting && <><button className="sl-add" disabled={value.beats.length >= 30} onClick={() => edit({ beats: [...value.beats, { id: uid(), title: "A real detail", shot: "Detail", seconds: 5, cue: "What do we need to see or hear?", captured: false }] })}>+ Add a scene</button><label className="sl-field">B-roll & sound<textarea rows={3} value={value.broll} onChange={e => edit({ broll: e.target.value })} /></label><label className="sl-field">Leave them somewhere to go<textarea rows={2} value={value.cta} onChange={e => edit({ cta: e.target.value })} /></label><div className="sl-caption"><span>CAPTION DIRECTION</span><p>lowercase. punchlines only.</p><small>Real audio comes first. Never fake a moment.</small></div></>}
      </div>
    </div>}
    {value && !shooting && <section className="sl-direction"><div><span className="sl-kicker">YOUR DIRECTOR'S CHAIR</span><h3>Find the angle with an AI director.</h3><p>A fresh read of your source and treatment, grounded in your creative voice.</p></div><button className="sl-primary" disabled={directing || saving} onClick={direct}>{directing ? "Directing your story…" : "✦ Get director notes"}</button>{value.directorNotes && <label className="sl-field">Proposed direction · edit before shooting<textarea rows={14} value={value.directorNotes} onChange={e => edit({ directorNotes: e.target.value })} /></label>}</section>}
    </fieldset>
  </section>;
}
