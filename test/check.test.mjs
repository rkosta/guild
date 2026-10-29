import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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
    edit("agents/tester.md", (t) => t.replace("model: inherit", "model: sonnet")),
  );
  assert.match(errors.join("\n"), /agents\/tester\.md: model must be "inherit"/);
});

test("frontmatter: agent name must match file name", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/tester.md", (t) => t.replace("name: tester", "name: testr")),
  );
  assert.match(errors.join("\n"), /name must equal the file name/);
});

test("frontmatter: reviewer cannot get Edit", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/reviewer.md", (t) => t.replace("tools: Read,", "tools: Read, Edit,")),
  );
  assert.match(errors.join("\n"), /reviewer must stay read-only/);
});

test("frontmatter: missing block is reported", () => {
  const errors = errorsFor(checkFrontmatter, (edit) =>
    edit("agents/analyst.md", (t) => t.replace(/^---\n[\s\S]*?\n---\n/, "")),
  );
  assert.match(errors.join("\n"), /agents\/analyst\.md: missing or unterminated/);
});

test("drift: tier table out of sync in one file", () => {
  const errors = errorsFor(checkDrift, (edit) =>
    edit("README.md", (t) => t.replace("| standard | opus | sonnet | sonnet | opus |", "| standard | opus | opus | sonnet | opus |")),
  );
  assert.match(errors.join("\n"), /README\.md: tier table differs/);
});

test("drift: haiku in a tier is rejected", () => {
  const errors = errorsFor(checkDrift, (edit) => {
    for (const f of ["commands/quest.md", "commands/quest-herdr.md", "README.md", "CLAUDE.md"]) {
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
    edit("CLAUDE.md", (t) => t.replace(/^\s+tester\.md.*\n/m, "")),
  );
  assert.match(errors.join("\n"), /layout is missing tester\.md/);
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

test("contract: reviewer verdict wording is enforced", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/reviewer.md", (t) => t.replace("PASS or CHANGES_REQUESTED", "OK or NOT_OK")),
  );
  assert.match(errors.join("\n"), /Verdict/);
});

test("contract: agents must not mention Herdr or STATUS lines", () => {
  const errors = errorsFor(checkContract, (edit) =>
    edit("agents/tester.md", (t) => t + "\nWrite to the Herdr pane.\nSTATUS: complete\n"),
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
