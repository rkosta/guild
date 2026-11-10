# CLAUDE.md — Guild

This repo is the **source** of a personal multi-agent development workflow for Claude Code. Nothing here runs as an app: the files are Markdown prompts that get copied into `~/.claude/` and used in other projects. Work in this repo means improving those prompts.

## Layout

```
agents/              subagent definitions → installed to ~/.claude/agents/
  analyst.md         request → plan.md (requirements, acceptance criteria, tasks)
  developer.md       implements one task at a time test-first (tests + code), applies review fixes
  reviewer.md        verifies against acceptance criteria; never edits code
  pr-reviewer.md     runs pr-review-toolkit:review-pr at the end; returns its output, never fixes
commands/            slash commands → installed to ~/.claude/commands/
  quest.md        orchestrator, subagent mode (works anywhere)
  quest-herdr.md  orchestrator, Herdr mode (one pane per agent)
  quest-orca.md   orchestrator, Orca mode (one pane per agent, supervised Orca workers)
scripts/
  install.sh         copies agents + commands into ~/.claude/ (macOS/Linux)
tools/check/         checkers run by `pnpm run check` (frontmatter, drift, contract)
test/                node:test tests for the checkers
README.md            user-facing docs: install, usage, tiers, flow
CLAUDE.md            this file
CHANGELOG.md         version history (newest first)
VERSION              current version, single source of truth
```

## How the workflow works

1. `/quest`, `/quest-herdr` or `/quest-orca` receives a task (optionally `--tier light|standard|complex`, default `standard`).
2. **analyst** writes `.guild/<slug>/plan.md` in the target project → orchestrator **stops for user approval**.
3. Per task: **developer** (test-first) → **reviewer**. On CHANGES_REQUESTED, back to developer, max **2 fix rounds**, then escalate to the user.
4. Orchestrator logs every agent run in the plan's `## Run log` and gives a summary (tier, models, files, tests, leftovers).
5. If every task passed, **pr-reviewer** runs once and the orchestrator shows the user its output unchanged. Nothing acts on it.

### Three orchestrator modes, one set of agents
- **Subagent mode** (`quest.md`): agents run as subagents in one session; the model is passed per launch.
- **Herdr mode** (`quest-herdr.md`): each agent is a separate `claude --agent <role> --model <m>` session in its own Herdr pane (2×2 grid right of the orchestrator: analyst and developer on the left, reviewer and pr-reviewer on the right). Control via the `herdr` CLI (`agent start`, `agent prompt --wait`, `agent wait`, `agent get`). Content via files: orchestrator writes `briefs/<step>-<role>.md`, agent writes `handoffs/<step>-<role>.md` ending with `STATUS: complete|blocked — reason`. Agents never talk to each other directly; the orchestrator relays.
- **Orca mode** (`quest-orca.md`): each agent is a `claude --agent <role> --model <m>` session in its own pane of a new Orca tab "quest <slug>" (same 2×2 grid, pr-reviewer under reviewer), started with `orca terminal create/split --command`. Each step is a supervised Orca worker task: `orca orchestration worker-start --terminal <h> --keep-open --run <run> --spec-file briefs/<step>-<role>.md`. Orca injects its own worker preamble (`ask`, `worker_done`), the agent writes the same handoff file with a `STATUS:` line and sends `worker_done --report-path <handoff>`, and the orchestrator blocks on `orchestration check --wait` until the mail arrives (Orca does not wake an idle session; its notice only rides along with the user's next message). Workers can `ask` the orchestrator mid-task; it answers from the plan or relays to the user.

## Decisions already made (don't undo without asking)
- **Installed at user level** (`~/.claude/`), never per project. Target projects must not need any setup or a CLAUDE.md.
- **Build/test commands are auto-detected** from the target project (package.json, *.csproj/*.sln, pyproject.toml, Makefile, go.mod…). CLAUDE.md in the target is optional.
- **Plans live in the target repo** under `.guild/`, git-ignored via `.git/info/exclude`. Never edit the target's `.gitignore` or any lint/format ignore config; agents ignore findings inside `.guild/` instead, and run formatters in write mode only on files they changed.
- **Approval checkpoint only after the plan.** No per-task approvals.
- **Developer works test-first** (red → green per acceptance criterion) and owns both tests and code; there is no separate tester (dropped in v4.0 to cut one agent run per task). It reuses the existing test framework, never adds a new one, and never weakens a test to get green. Its reply carries a `Red:` line per new test (the failure it showed before the code existed), and the reviewer treats a missing or implausible one, or a test that would pass without the change, as must-fix.
- **Reviewer is read-only on code.** It has `Write` only so it can save its handoff file in Herdr and Orca mode.
- **PR reviewer only reports.** It runs `pr-review-toolkit:review-pr` with every aspect except `simplify` (the simplifier edits code), and the orchestrator returns the output unchanged. It needs `Skill` and `Agent` because the skill launches review agents, and `Write` only for its handoff file.
- **Analyst reads Jira, nobody writes to it.** It has the claude.ai Atlassian connector's read tools (`getAccessibleAtlassianResources`, `getJiraIssue`, `listJiraIssueComments`, `searchJiraIssuesUsingJql`). The connector is optional: without it, the analyst works from the request text. `pnpm run check` rejects Atlassian write tools on any agent.
- **Tiers are chosen by the user**, never by the analyst. No haiku in any tier.

  | Tier | analyst | developer | reviewer | pr-reviewer |
  |---|---|---|---|---|
  | light | sonnet | sonnet | sonnet | sonnet |
  | standard | opus | sonnet | opus | opus |
  | complex | opus | opus | opus | opus |

- Agent files keep `model: inherit`; the orchestrator always passes the model explicitly.
- **Herdr mode uses brief/handoff files from the first prompt.** Herdr's own skill says to ask for file output only as a fallback; we deviate on purpose because handoffs are the workflow's record and its completion signal (`STATUS:` line). Everything else in `quest-herdr.md` follows the skill's rules (no bare `herdr`, IDs from JSON, `--no-focus`, inspect before resending, don't answer dialogs). Briefs must not mention "Herdr", so workers don't load the skill.
- **Orca mode uses supervised workers, not raw terminal input.** Chosen over a Herdr-style mirror so workers can ask questions. The orchestrator waits with `check --wait` in 9-minute chunks (Bash tool timeout 10 minutes), because Orca's wake notice only arrives when the user types. Panes are started by us (custom argv, so `--agent <role>` applies) and adopted with `worker-start --terminal`; a `--keep-open` pane takes the next task with its context intact. One Orca Run per quest (`run-create`) so mail from other runs never mixes in. Agents always go in a new tab (Orca's layout JSON has no pane sizes to decide otherwise). Cleanup is `orca terminal close`, only on the user's yes (`worker-release` won't close terminals we created). Briefs must not mention Orca; the preamble covers the protocol.
- Herdr and Orca modes are **separate commands** for now; `quest.md` stays stable. Merging into one auto-detecting command (`HERDR_ENV=1`) is a possible later step.

## Rules for editing
- **Agent files are shared by all three modes.** Any change must work as a subagent *and* as a standalone `claude --agent` session. Mode-specific instructions (handoff files, STATUS lines) belong in the orchestrator's briefs, not in the agent files.
- **The tier table exists in five places:** `quest.md`, `quest-herdr.md`, `quest-orca.md`, `README.md` and this file. Change them all together.
- **Phase logic is duplicated** across the three commands (approval, fix loop, run log, summary). When changing one, check whether the others need the same change.
- **YAML frontmatter:** quote any value that starts with `[`, `{`, `*`, `&`, `!`, `|`, `>`, `%`, `@` or contains a colon followed by a space. (`argument-hint` broke once because of an unquoted `[`.) `pnpm run check` validates them.
- Keep prompts short and imperative. Each agent has a fixed **Reply format**; the orchestrator relies on it (e.g. `Verdict: PASS|CHANGES_REQUESTED`), so don't rename those fields casually.
- Update the README when behavior changes. To release: bump `VERSION` and `package.json`, add a `CHANGELOG.md` entry on top, and update the README title. `pnpm run check` fails if they disagree.
- **Run `pnpm run check` and `pnpm test` before committing.** A lefthook pre-commit hook does it for you. The checks replace the manual YAML one-liner: they validate frontmatter, tier-table and version drift, and the reply-format/STATUS contract between agents and orchestrators. If you change one of those contracts on purpose, update the checker in `tools/check/` and its test in the same commit.

## Setup
`mise install` (Node 24, pnpm 12, shellcheck), then `pnpm install` (also installs the git hook).

## Installing / testing changes
```bash
pnpm run check && pnpm test
./scripts/install.sh
```
Restart Claude Code, check `/agents`. Test on a throwaway repo with a small `--tier light` task first. For Herdr mode: run inside a Herdr pane, with `herdr integration install claude` done and `"Bash(herdr *)"` allowed in `~/.claude/settings.json`. For Orca mode: run inside an Orca terminal, with `"Bash(orca *)"` allowed.

## Backlog (not started)
- More workflows under the Guild name: `/hunt` (bug fix: reproduce → fix → regression test), `/expedition` (research, no code), `/siege` (big refactor/migration), `/audit` (read-only review)
- Escalate a tier in the fix loop (e.g. retry on opus after 2 failed reviews)
- Single command that auto-detects Herdr or Orca
- Run independent tasks in parallel (pane or worktree per developer)
- Git branch per task, auto-commit on PASS
- Pull tasks from GitHub/Jira issues
- Optional: archive finished plans to Obsidian
