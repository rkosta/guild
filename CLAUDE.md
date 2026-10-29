# CLAUDE.md — Guild

This repo is the **source** of a personal multi-agent development workflow for Claude Code. Nothing here runs as an app: the files are Markdown prompts that get copied into `~/.claude/` and used in other projects. Work in this repo means improving those prompts.

## Layout

```
agents/              subagent definitions → installed to ~/.claude/agents/
  analyst.md         request → plan.md (requirements, acceptance criteria, tasks)
  developer.md       implements one task at a time, applies review fixes
  tester.md          writes + runs tests after each task (test files only)
  reviewer.md        verifies against acceptance criteria; never edits code
commands/            slash commands → installed to ~/.claude/commands/
  quest.md        orchestrator, subagent mode (works anywhere)
  quest-herdr.md  orchestrator, Herdr mode (one pane per agent)
scripts/
  install.sh         copies agents + commands into ~/.claude/ (macOS/Linux)
README.md            user-facing docs: install, usage, tiers, flow
CLAUDE.md            this file
```

## How the workflow works

1. `/quest` or `/quest-herdr` receives a task (optionally `--tier light|standard|complex`, default `standard`).
2. **analyst** writes `.guild/<slug>/plan.md` in the target project → orchestrator **stops for user approval**.
3. Per task: **developer** → **tester** → **reviewer**. On CHANGES_REQUESTED, back to developer, max **2 fix rounds**, then escalate to the user.
4. Orchestrator logs every agent run in the plan's `## Run log` and ends with a summary (tier, models, files, tests, leftovers).

### Two orchestrator modes, one set of agents
- **Subagent mode** (`quest.md`): agents run as subagents in one session; the model is passed per launch.
- **Herdr mode** (`quest-herdr.md`): each agent is a separate `claude --agent <role> --model <m>` session in its own Herdr pane (2×2 grid right of the orchestrator). Control via the `herdr` CLI (`agent start`, `agent prompt --wait`, `agent wait`, `agent get`). Content via files: orchestrator writes `briefs/<step>-<role>.md`, agent writes `handoffs/<step>-<role>.md` ending with `STATUS: complete|blocked — reason`. Agents never talk to each other directly; the orchestrator relays.

## Decisions already made (don't undo without asking)
- **Installed at user level** (`~/.claude/`), never per project. Target projects must not need any setup or a CLAUDE.md.
- **Build/test commands are auto-detected** from the target project (package.json, *.csproj/*.sln, pyproject.toml, Makefile, go.mod…). CLAUDE.md in the target is optional.
- **Plans live in the target repo** under `.guild/`, git-ignored via `.git/info/exclude`. Never edit the target's `.gitignore`.
- **Approval checkpoint only after the plan.** No per-task approvals.
- **Tests are written after implementation**, not TDD. Tester reuses the existing framework, never adds a new one, never edits production code.
- **Reviewer is read-only on code.** It has `Write` only so it can save its handoff file in Herdr mode.
- **Tiers are chosen by the user**, never by the analyst. No haiku in any tier.

  | Tier | analyst | developer | tester | reviewer |
  |---|---|---|---|---|
  | light | sonnet | sonnet | sonnet | sonnet |
  | standard | opus | sonnet | sonnet | opus |
  | complex | opus | opus | sonnet | opus |

- Agent files keep `model: inherit`; the orchestrator always passes the model explicitly.
- **Herdr mode uses brief/handoff files from the first prompt.** Herdr's own skill says to ask for file output only as a fallback; we deviate on purpose because handoffs are the workflow's record and its completion signal (`STATUS:` line). Everything else in `quest-herdr.md` follows the skill's rules (no bare `herdr`, IDs from JSON, `--no-focus`, inspect before resending, don't answer dialogs). Briefs must not mention "Herdr", so workers don't load the skill.
- Herdr mode is a **separate command** for now; `quest.md` stays stable. Merging into one auto-detecting command (`HERDR_ENV=1`) is a possible later step.

## Rules for editing
- **Agent files are shared by both modes.** Any change must work as a subagent *and* as a standalone `claude --agent` session. Mode-specific instructions (handoff files, STATUS lines) belong in the orchestrator's briefs, not in the agent files.
- **The tier table exists in three places:** `quest.md`, `quest-herdr.md` and `README.md`. Change all three together.
- **Phase logic is duplicated** across the two commands (approval, fix loop, run log, summary). When changing one, check whether the other needs the same change.
- **YAML frontmatter:** quote any value that starts with `[`, `{`, `*`, `&`, `!`, `|`, `>`, `%`, `@` or contains `: `. (`argument-hint` broke once because of an unquoted `[`.) Validate after editing:
  ```bash
  python3 -c "import yaml,glob; [print('OK', f, yaml.safe_load(open(f).read().split('---')[1]) and '') for f in glob.glob('*/*.md')]"
  ```
- Keep prompts short and imperative. Each agent has a fixed **Reply format**; the orchestrator relies on it (e.g. `Verdict: PASS|CHANGES_REQUESTED`), so don't rename those fields casually.
- Update the README when behavior changes. Bump the version in its title.

## Installing / testing changes
```bash
./scripts/install.sh
```
Restart Claude Code, check `/agents`. Test on a throwaway repo with a small `--tier light` task first. For Herdr mode: run inside a Herdr pane, with `herdr integration install claude` done and `"Bash(herdr *)"` allowed in `~/.claude/settings.json`.

## Version history
- **v1** — four subagents + `/quest`, project-level, plans in repo.
- **v1.1** — moved to user level; no CLAUDE.md needed in target projects; build/test auto-detection.
- **v1.2** — plans back in the target repo (`.guild/`, git-ignored via `.git/info/exclude`).
- **v1.3** — tiers (`--tier`), tier + models recorded in the plan, run log, summary. v1.3.1: quoted `argument-hint` YAML fix.
- **v2.0** — `/quest-herdr`: one Herdr pane per agent, brief/handoff files, reviewer gets `Write` for handoffs.
- **v2.1** — aligned `/quest-herdr` with Herdr's agent skill: CLI safety rules, pane-width check before the 2×2 grid, `agent_not_ready` (folder-trust dialog) handling, check for `blocked` before prompting, `agent_prompt_stalled` handling, workers told not to control other panes.
- **v2.2** — agents get `codegraph_explore` (all), Figma read tools + `create_session` (analyst, developer; reviewer gets create_session + screenshot/context only), `Skill` (analyst, developer). No Herdr/Artifact tools on purpose.

- **v3.0** — renamed to **Guild**; `/dev-task` → `/quest`, `/dev-task-herdr` → `/quest-herdr`. Plan folder in target projects renamed `.dev-workflow/` → `.guild/` (old plans stay where they are; the old exclude line in `.git/info/exclude` is harmless). Old installed `dev-task*.md` files must be deleted from `~/.claude/commands/` by hand.

## Backlog (not started)
- More workflows under the Guild name: `/hunt` (bug fix: reproduce → fix → regression test), `/expedition` (research, no code), `/siege` (big refactor/migration), `/audit` (read-only review)
- Escalate a tier in the fix loop (e.g. retry on opus after 2 failed reviews)
- Single command that auto-detects Herdr
- Run independent tasks in parallel (pane or worktree per developer)
- Git branch per task, auto-commit on PASS
- Pull tasks from GitHub/Jira issues
- Optional: archive finished plans to Obsidian
