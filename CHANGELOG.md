# Changelog

Newest first. The top entry must match `VERSION` and the README title (`pnpm run check` verifies this).

## v3.2.0

`/quest-herdr`: on a narrow pane (under ~210 columns) the agents go into a new tab automatically instead of asking. Herdr agent handles are now `<slug>-<role>`, so leftover agents from earlier runs don't collide. The start of a run lists panes left over from earlier runs and asks whether to close them. Wrap-up asks whether to close the agent panes instead of just listing them. Nothing is closed without an explicit yes.

## v3.1.0

Herdr mode names each Claude session `<slug>-<role>` (`-n`), so finished sessions can be found via `claude --resume`. Herdr agent handles stay `<role>`.

## v3.0.0

Renamed to **Guild**; `/dev-task` → `/quest`, `/dev-task-herdr` → `/quest-herdr`. Plan folder in target projects renamed `.dev-workflow/` → `.guild/` (old plans stay where they are; the old exclude line in `.git/info/exclude` is harmless). Old installed `dev-task*.md` files must be deleted from `~/.claude/commands/` by hand.

## v2.2.0

Agents get `codegraph_explore` (all), Figma read tools + `create_session` (analyst, developer; reviewer gets create_session + screenshot/context only), `Skill` (analyst, developer). No Herdr/Artifact tools on purpose.

## v2.1.0

Aligned `/quest-herdr` with Herdr's agent skill: CLI safety rules, pane-width check before the 2×2 grid, `agent_not_ready` (folder-trust dialog) handling, check for `blocked` before prompting, `agent_prompt_stalled` handling, workers told not to control other panes.

## v2.0.0

`/quest-herdr`: one Herdr pane per agent, brief/handoff files, reviewer gets `Write` for handoffs.

## v1.3.0

Tiers (`--tier`), tier + models recorded in the plan, run log, summary. v1.3.1: quoted `argument-hint` YAML fix.

## v1.2.0

Plans back in the target repo (`.guild/`, git-ignored via `.git/info/exclude`).

## v1.1.0

Moved to user level; no CLAUDE.md needed in target projects; build/test auto-detection.

## v1.0

Four subagents + `/quest`, project-level, plans in repo.
