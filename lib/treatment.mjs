// The treatment model: a short build-in-public video planned as a sequence of beats.
// Pure functions shared by the UI, the API and the tests.

/** Where a finished video points people. Edit labels and calls to action for your own work. */
export const DESTINATIONS = {
  studio: { label: "Your studio or agency", cta: "Want something like this built? Start a project with the studio." },
  newsletter: { label: "Your newsletter", cta: "The full breakdown is in the newsletter." },
  portfolio: { label: "Your portfolio", cta: "Explore the work on my portfolio." },
};
export const INTENTS = ["proof", "process", "position"];

export const runtime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export const totalSeconds = (value) => value.beats.reduce((n, b) => n + b.seconds, 0);

const UNLOCK = {
  proof: "Let a potential client see the actual work and understand what it does.",
  process: "Show the decision behind the work so someone understands how you think.",
  position: "Make one specific belief memorable, then support it with the work.",
};

/** A five-beat starting treatment for a real source (or a blank one). */
export function createTreatment(source, intent = "proof", destination = "studio", uid = () => crypto.randomUUID()) {
  const subject = source?.title.toLowerCase() || "the work you're building";
  const cta = DESTINATIONS[destination].cta;
  return {
    version: 1, intent, destination, source,
    hook: `What's the real story behind ${subject}?`,
    businessUnlock: UNLOCK[intent],
    cta,
    broll: "Hands at the desk. The actual interface. A detail from your workspace. A quiet transition. Capture clean room tone.",
    beats: [
      { id: uid(), title: "The question", shot: "Close-up", seconds: 5, cue: `Open on a real detail from ${subject}. Ask the question before explaining.`, captured: false },
      { id: uid(), title: "The stakes", shot: "To camera", seconds: 12, cue: "What was the actual problem? Say who it mattered to. Use your own words; leave out any outcome you cannot verify.", captured: false },
      { id: uid(), title: "Show the work", shot: "Screen recording", seconds: 22, cue: "Record the real artifact. Show one decision, one constraint, and what you changed. Hide private client details before filming.", captured: false },
      { id: uid(), title: "What holds up", shot: "Detail", seconds: 13, cue: "Show what can be demonstrated now. Name what is still a demo or unfinished. Let the captured audio do the work.", captured: false },
      { id: uid(), title: "Leave a door open", shot: "To camera", seconds: 8, cue: cta, captured: false },
    ],
  };
}

/** The shoot brief the UI exports and sends to the AI director. */
export function treatmentMarkdown(title, value) {
  const src = value.source
    ? `${value.source.title}\n${value.source.summary}\n${value.source.source}\n${value.source.href}`
    : "Original treatment — add your own verified source.";
  const beats = value.beats
    .map((b, i) => `${i + 1}. ${b.title} · ${b.shot} · ${b.seconds}s · ${b.captured ? "captured" : "to shoot"}\n   ${b.cue}`)
    .join("\n\n");
  return `# ${title}\n\nTreatment draft — proposed scenes, not a record of events.\n\nIntent: ${value.intent}\nDestination: ${DESTINATIONS[value.destination]?.label ?? value.destination}\nRuntime: ${runtime(totalSeconds(value))}\n\n## Source\n${src}\n\n## Hook\n${value.hook}\n\n## Business unlock\n${value.businessUnlock}\n\n## Shoot sequence\n${beats}\n\n## B-roll & sound\n${value.broll}\n\n## Call to action\n${value.cta}\n\n## Caption direction\nLowercase punchlines only. Captions never narrate. Real captured audio comes first.\n`;
}
