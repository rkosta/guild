import { listMd, read } from "./lib.mjs";

export function checkContract(root) {
  const errors = [];
  const fail = (file, msg) => errors.push(`${file}: ${msg}`);

  // Every agent keeps a fixed reply format; mode-specific wiring stays out.
  for (const file of listMd(root, "agents")) {
    const path = `agents/${file}`;
    const text = read(root, path);
    if (file === "analyst.md") {
      // The analyst's contract is the plan file, not a reply format.
      for (const heading of ["## Output", "## Run log", "## Tasks", "## Acceptance criteria"]) {
        if (!new RegExp(`^${heading}\\s*$`, "m").test(text)) fail(path, `missing '${heading}' (the orchestrator relies on the plan structure)`);
      }
      // Task fields other agents read: developer (Tests needed), orchestrators (Status), later parallel runs (Blocked by).
      for (const field of ["- Tests needed:", "- Blocked by:", "- Status: todo"]) {
        if (!text.includes(field)) fail(path, `plan template must keep the task field '${field}'`);
      }
    } else if (!/^## Reply format\s*$/m.test(text)) {
      fail(path, "missing '## Reply format' section");
    }
    if (/herdr/i.test(text)) fail(path, "agent files are shared by every mode and must not mention Herdr");
    if (/\borca\b/i.test(text)) fail(path, "agent files are shared by every mode and must not mention Orca");
    if (/^STATUS:/m.test(text)) fail(path, "STATUS lines belong in the orchestrator's briefs, not the agent file");
  }

  // The reviewer's verdict is what both orchestrators branch on.
  const reviewer = read(root, "agents/reviewer.md");
  if (!/\*\*Verdict:\*\*\s*PASS or CHANGES_REQUESTED/.test(reviewer)) {
    fail("agents/reviewer.md", "reply format must contain '**Verdict:** PASS or CHANGES_REQUESTED'");
  }
  // The developer writes the tests (test-first); the orchestrators report its test fields.
  const developer = read(root, "agents/developer.md");
  for (const field of ["**Tests:**", "**Red:**", "**Test result:**"]) {
    if (!developer.includes(field)) fail("agents/developer.md", `reply format must contain '${field}' (the developer owns the tests)`);
  }
  // Re-reviews: orchestrators brief them, the reviewer knows how to scope one.
  if (!/^## Re-reviews\s*$/m.test(reviewer)) fail("agents/reviewer.md", "missing '## Re-reviews' (orchestrators brief fix rounds as re-reviews)");

  for (const file of ["commands/quest.md", "commands/quest-herdr.md", "commands/quest-orca.md"]) {
    const text = read(root, file);
    if (!/\*\*re-review\*\*/.test(text)) fail(file, "fix loop must re-run the reviewer as a **re-review**");
    if (!text.includes("<HH:MM>–<HH:MM> (<n>m)")) fail(file, "run log lines must carry '<HH:MM>–<HH:MM> (<n>m)' timing");
    if (!text.includes("agent runs (developer + reviewer each)")) fail(file, "approval must show the agent-run estimate");
    if (/\btester\b/i.test(text)) fail(file, "there is no tester agent; the developer writes the tests");
    if (!/CHANGES_REQUESTED/.test(text) || !/\bPASS\b/.test(text)) fail(file, "must handle both PASS and CHANGES_REQUESTED verdicts");
  }

  // Herdr mode: handoff completion signal and brief hygiene.
  const herdr = read(root, "commands/quest-herdr.md");
  if (!herdr.includes("STATUS: complete") || !herdr.includes("STATUS: blocked")) {
    fail("commands/quest-herdr.md", "must define both 'STATUS: complete' and 'STATUS: blocked' handoff lines");
  }
  herdr.split("\n").forEach((line, i) => {
    if (/^\s*>/.test(line) && /herdr/i.test(line)) {
      fail("commands/quest-herdr.md", `line ${i + 1}: brief text must not mention Herdr (workers would load its skill)`);
    }
  });

  // Orca mode: same handoff STATUS lines, plus Orca's worker_done; briefs stay Orca-free.
  const orca = read(root, "commands/quest-orca.md");
  if (!orca.includes("STATUS: complete") || !orca.includes("STATUS: blocked")) {
    fail("commands/quest-orca.md", "must define both 'STATUS: complete' and 'STATUS: blocked' handoff lines");
  }
  if (!orca.includes("worker_done")) fail("commands/quest-orca.md", "must tell workers to report with worker_done");
  orca.split("\n").forEach((line, i) => {
    if (/^\s*>/.test(line) && /\borca\b/i.test(line)) {
      fail("commands/quest-orca.md", `line ${i + 1}: brief text must not mention Orca (Orca's preamble covers the protocol)`);
    }
  });

  return errors;
}
