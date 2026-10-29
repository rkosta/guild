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
    } else if (!/^## Reply format\s*$/m.test(text)) {
      fail(path, "missing '## Reply format' section");
    }
    if (/herdr/i.test(text)) fail(path, "agent files are shared by both modes and must not mention Herdr");
    if (/^STATUS:/m.test(text)) fail(path, "STATUS lines belong in the orchestrator's briefs, not the agent file");
  }

  // The reviewer's verdict is what both orchestrators branch on.
  const reviewer = read(root, "agents/reviewer.md");
  if (!/\*\*Verdict:\*\*\s*PASS or CHANGES_REQUESTED/.test(reviewer)) {
    fail("agents/reviewer.md", "reply format must contain '**Verdict:** PASS or CHANGES_REQUESTED'");
  }
  for (const file of ["commands/quest.md", "commands/quest-herdr.md"]) {
    const text = read(root, file);
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

  return errors;
}
