import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkFrontmatter } from "../tools/check/frontmatter.mjs";
import { checkDrift } from "../tools/check/drift.mjs";
import { checkContract } from "../tools/check/contract.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const COPY = ["agents", "commands", "scripts", "README.md", "CLAUDE.md", "CHANGELOG.md", "VERSION"];

/** Copy the real repo to a temp dir, apply `mutate(edit)`, return the dir. */
function fixture(mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "guild-"));
  for (const f of COPY) cpSync(join(repo, f), join(root, f), { recursive: true });
  mutate((rel, fn) => {
    const p = join(root, rel);
    const before = readFileSync(p, "utf8");
    const after = fn(before);
    assert.notEqual(after, before, `mutation of ${rel} changed nothing`);
    writeFileSync(p, after);
  });
  return root;
}

function errorsFor(check, mutate) {
  const root = fixture(mutate);
  try {
    return check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the real repo passes every check", () => {
  for (const check of [checkFrontmatter, checkDrift, checkContract]) {
    assert.deepEqual(check(repo), []);
  }
});

test("frontmatter: unquoted argument-hint is rejected", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("commands/quest.md", (t) => t.replace(/argument-hint: "(.*)"/, "argument-hint: $1")),
  );
  assert.match(errors.join("\n"), /commands\/quest\.md: .*argument-hint|invalid YAML/);
});

test("frontmatter: agent model must be inherit", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/developer.md", (t) => t.replace("model: inherit", "model: sonnet")),
  );
  assert.match(errors.join("\n"), /agents\/developer\.md: model must be "inherit"/);
});

test("frontmatter: agent name must match file name", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/developer.md", (t) => t.replace("name: developer", "name: dev")),
  );
  assert.match(errors.join("\n"), /name must equal the file name/);
});

test("frontmatter: reviewer cannot get Edit", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/reviewer.md", (t) => t.replace("tools: Read,", "tools: Read, Edit,")),
  );
  assert.match(errors.join("\n"), /reviewer must stay read-only/);
});

test("frontmatter: pr-reviewer cannot get Edit", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/pr-reviewer.md", (t) => t.replace("tools: Read,", "tools: Read, Edit,")),
  );
  assert.match(errors.join("\n"), /pr-reviewer must stay read-only/);
});

test("frontmatter: Atlassian tools must be read-only", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/analyst.md", (t) => t.replace("tools: Read,", "tools: Read, mcp__claude_ai_Atlassian_MCP__editJiraIssue,")),
  );
  assert.match(errors.join("\n"), /analyst\.md: Atlassian tools must be read-only: mcp__claude_ai_Atlassian_MCP__editJiraIssue/);
});

test("frontmatter: missing block is reported", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/analyst.md", (t) => t.replace(/^---\n[\s\S]*?\n---\n/, "")),
  );
  assert.match(errors.join("\n"), /agents\/analyst\.md: missing or unterminated/);
});

test("drift: tier table out of sync in one file", () => {
  const errors = errorsFor(checkDrift, (edit) =>
    edit("README.md", (t) => t.replace("| standard | opus | sonnet | opus | opus |", "| standard | opus | opus | opus | opus |")),
  );
  assert.match(errors.join("\n"), /README\.md: tier table differs/);
});

test("drift: haiku in a tier is rejected", () => {
  const errors = errorsFor(checkDrift, (edit) => {
    for (const f of ["commands/quest.md", "commands/quest-herdr.md", "commands/quest-orca.md", "README.md", "CLAUDE.md"]) {
      edit(f, (t) => t.replace("| light | sonnet | sonnet | sonnet | sonnet |", "| light | haiku | sonnet | sonnet | sonnet |"));
    }
  });
  assert.match(errors.join("\n"), /no haiku in any tier/);
});

test("drift: README version must match VERSION", () => {
  const errors = errorsFor(checkDrift, (edit) => edit("VERSION", (t) => "9.9.9\n"));
  assert.match(errors.join("\n"), /README\.md: title version/);
  assert.match(errors.join("\n"), /CHANGELOG\.md: top entry/);
});

test("drift: layout must list every real file", () => {
  const errors = errorsFor(checkDrift, (edit) =>
    edit("CLAUDE.md", (t) => t.replace(/^\s+developer\.md.*\n/m, "")),
  );
  assert.match(errors.join("\n"), /layout is missing developer\.md/);
});

test("contract: agent file must keep the Reply format section", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/developer.md", (t) => t.replace("## Reply format", "## Reply")),
  );
  assert.match(errors.join("\n"), /agents\/developer\.md: missing '## Reply format'/);
});

test("contract: analyst must keep the plan structure", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/analyst.md", (t) => t.replace("## Run log", "## Log")),
  );
  assert.match(errors.join("\n"), /agents\/analyst\.md: missing '## Run log'/);
});

test("contract: developer must report its tests", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/developer.md", (t) => t.replace("**Test result:**", "**Result:**")),
  );
  assert.match(errors.join("\n"), /developer\.md: reply format must contain '\*\*Test result:\*\*'/);
});

test("contract: developer must show red evidence", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/developer.md", (t) => t.replace("**Red:**", "**Failing:**")),
  );
  assert.match(errors.join("\n"), /developer\.md: reply format must contain '\*\*Red:\*\*'/);
});

test("contract: orchestrators must not brief a tester", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("commands/quest.md", (t) => t + "\n2. Run the **tester** subagent.\n"),
  );
  assert.match(errors.join("\n"), /quest\.md: there is no tester agent/);
});

test("contract: reviewer verdict wording is enforced", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/reviewer.md", (t) => t.replace("PASS or CHANGES_REQUESTED", "OK or NOT_OK")),
  );
  assert.match(errors.join("\n"), /Verdict/);
});

test("contract: agents must not mention Herdr or STATUS lines", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/developer.md", (t) => t + "\nWrite to the Herdr pane.\nSTATUS: complete\n"),
  );
  assert.match(errors.join("\n"), /must not mention Herdr/);
  assert.match(errors.join("\n"), /STATUS lines belong/);
});

test("contract: briefs in quest-herdr must not say Herdr", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("commands/quest-herdr.md", (t) => t + "\n> Use the Herdr CLI.\n"),
  );
  assert.match(errors.join("\n"), /brief text must not mention Herdr/);
});

test("contract: agents must not mention Orca", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/developer.md", (t) => t + "\nReport with orca orchestration send.\n"),
  );
  assert.match(errors.join("\n"), /agents\/developer\.md: .*must not mention Orca/);
});

test("drift: quest-orca tier table must match", () => {
  const errors = errorsFor(checkDrift, (edit) =>
    edit("commands/quest-orca.md", (t) => t.replace("| complex | opus | opus | opus | opus |", "| complex | opus | sonnet | opus | opus |")),
  );
  assert.match(errors.join("\n"), /commands\/quest-orca\.md: tier table differs/);
});

test("contract: quest-orca needs STATUS lines and worker_done", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("commands/quest-orca.md", (t) => t.replaceAll("STATUS: blocked", "STATUS: stuck").replaceAll("worker_done", "worker-finished")),
  );
  assert.match(errors.join("\n"), /quest-orca\.md: must define both 'STATUS: complete' and 'STATUS: blocked'/);
  assert.match(errors.join("\n"), /quest-orca\.md: must tell workers to report with worker_done/);
});

test("contract: briefs in quest-orca must not say Orca", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("commands/quest-orca.md", (t) => t + "\n> Use the orca CLI to read other panes.\n"),
  );
  assert.match(errors.join("\n"), /brief text must not mention Orca/);
});

test("contract: analyst plan template keeps the task fields", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/analyst.md", (t) => t.replace("- Blocked by:", "- Depends on:")),
  );
  assert.match(errors.join("\n"), /analyst\.md: plan template must keep the task field '- Blocked by:'/);
});

test("contract: reviewer must keep the Re-reviews section", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/reviewer.md", (t) => t.replace("## Re-reviews", "## Second pass")),
  );
  assert.match(errors.join("\n"), /reviewer\.md: missing '## Re-reviews'/);
});

test("contract: each orchestrator keeps re-review, run timing and the run estimate", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("commands/quest-herdr.md", (t) =>
      t.replace("**re-review**", "full review").replaceAll("<HH:MM>–<HH:MM> (<n>m)", "<time>").replace("agent runs (developer + reviewer each)", "runs"),
    ),
  );
  const out = errors.join("\n");
  assert.match(out, /quest-herdr\.md: fix loop must re-run the reviewer as a \*\*re-review\*\*/);
  assert.match(out, /quest-herdr\.md: run log lines must carry/);
  assert.match(out, /quest-herdr\.md: approval must show the agent-run estimate/);
});

test("drift: a retired agent must not still ship", () => {
  const errors = errorsFor(checkDrift, (edit) =>
    edit("scripts/install.sh", (t) => t.replace("RETIRED=(agents/tester.md)", "RETIRED=(agents/tester.md agents/developer.md)")),
  );
  assert.match(errors.join("\n"), /agents\/developer\.md is listed as retired but still ships/);
});

test("install.sh copies agents and commands, removes retired ones, keeps the user's own", () => {
  const home = mkdtempSync(join(tmpdir(), "guild-home-"));
  try {
    mkdirSync(join(home, "agents"), { recursive: true });
    writeFileSync(join(home, "agents", "tester.md"), "old\n");
    writeFileSync(join(home, "agents", "mine.md"), "user's own\n");
    const run = spawnSync("bash", [join(repo, "scripts", "install.sh")], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: home },
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(!existsSync(join(home, "agents", "tester.md")), "retired tester.md should be removed");
    assert.ok(existsSync(join(home, "agents", "mine.md")), "the user's own agent must be kept");
    assert.ok(existsSync(join(home, "agents", "developer.md")), "developer.md should be installed");
    assert.ok(existsSync(join(home, "commands", "quest.md")), "quest.md should be installed");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
