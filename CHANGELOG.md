# Changelog

Newest first. The top entry must match `VERSION` and the README title (`pnpm run check` verifies this).

## v4.2.0
The analyst can read Jira. When the request names an issue (`ABC-123` or a Jira URL), it fetches the issue and its comments through the claude.ai Atlassian connector and uses them as part of the request, follows linked or parent issues only when the ticket points to them, and lists any conflict between the request and the ticket as an open question. The plan's Summary gets a `Ticket:` line. Tools are read-only (`getAccessibleAtlassianResources`, `getJiraIssue`, `listJiraIssueComments`, `searchJiraIssuesUsingJql`), and the frontmatter check now rejects Atlassian write tools on any agent. Without the connector, the analyst says so and works from the request text.

## v4.1.0
Faster fix rounds and visible cost. Each `## Run log` line now carries start/end time and minutes (`<step> | <role> | <model> | HH:MM–HH:MM (<n>m) | <result>`), and the wrap-up summary reports total wall-clock time and minutes per role, so you can see where a run's time goes. A reviewer re-run after a fix round is now a re-review: it checks only the previous must-fix items, runs the build and tests, and reads only the code the fix touched. It no longer redoes the whole review or adds new findings unless the fix caused them. At the approval stop, the orchestrator shows roughly how many agent runs the plan means (N tasks → about 2N runs, plus fix rounds and one PR review). The checker now guards these contracts: the analyst's task fields (`Tests needed`, `Blocked by`, `Status`), the reviewer's `## Re-reviews` section, and the re-review, run-timing and run-estimate wording in each orchestrator. It also fails if `install.sh` lists as retired an agent that still ships. A new test runs `install.sh` against a temp `CLAUDE_CONFIG_DIR`.

## v4.0.0
The tester agent is gone. The developer now works test-first: for each acceptance criterion it writes a failing test, watches it fail, then writes the code, and it reports its tests, the red evidence and the full-suite result in three new reply fields (`Tests`, `Red`, `Test result`). `Red` lists the first failure line each new test showed before the code existed. Review fixes for bugs start with a failing test. The reviewer also checks that each covered criterion has a behavior test, that no test was weakened to get green, and that every `Red` line matches its test's assertion. A test that would still pass with the production change removed, or a missing or generic `Red` line, is a must-fix. Each task now takes two agent runs instead of three, and so does each fix round. The tier table drops the tester column, so `complex` is all opus. In Herdr and Orca mode the grid is analyst and developer on the left, reviewer and pr-reviewer on the right. Step names lose `-test`. `install.sh` removes the old `~/.claude/agents/tester.md`. Breaking: plans and briefs from earlier runs that mention the tester won't resume as they were.

## v3.7.0
Analyst plans fewer, bigger tasks. Each task is now a vertical slice (one behavior end to end) that can be built, tested and reviewed on its own, instead of a sliver capped at ~5 files. Setup and plumbing get folded into the first task that needs them, and the analyst merges tasks when it has more than 8 (most requests need 1–6). Each task now lists `Blocked by:`, groundwork for running independent tasks in parallel. Prompted by a 16-task brochure-site plan that meant ~48 sequential agent runs.

## v3.6.0
`/quest-orca --headroom`: launches every agent pane through `headroom wrap claude --no-proxy --code-memory none`, reusing the Headroom proxy that is already running (port from `ANTHROPIC_BASE_URL`, `$HEADROOM_PORT` or 8787). The orchestrator checks the proxy's `/health` first and stops if it's down. Off by default; other modes unchanged.

## v3.5.2

`/quest-orca`: the orchestrator now waits for worker mail with `orchestration check --wait` (9-minute chunks, Bash tool timeout raised to 10 minutes) instead of ending its turn. Orca's "You have N orchestration messages" notice only arrived when the user typed something, so runs stalled until someone asked for a status. `/quest-herdr`: blocking `herdr` calls now run with the Bash tool timeout raised to 10 minutes and wait in 9-minute chunks, so the default 2-minute Bash timeout no longer cuts them off.

## v3.5.1

Agents ignore lint/format findings inside `.guild/` instead of proposing project config changes (`.prettierignore`, ESLint ignores). Developer and tester run formatters and auto-fixers in write mode only on files they changed. The reviewer still runs the project's full checks. The analyst notes whether lint/format commands scan the whole repo.

## v3.5.0

New `/quest-orca`: the same workflow inside the Orca IDE. Agents run in their own Orca tab, in the same grid as Herdr mode (`claude --agent <role> --model <m>`). Each step is a supervised Orca worker task (`orchestration worker-start --terminal`), so workers report with `worker_done`, can `ask` the orchestrator questions, and Orca wakes the orchestrator instead of it waiting. Briefs, handoff files and `STATUS:` lines work as in Herdr mode. The analyst now has `Bash`, limited by its instructions to read-only inspection, so it can send `worker_done` (without it, every plan step ended in an Orca escalation). The plan's `## Workflow` models line now includes pr-reviewer. The checkers now cover quest-orca: tier table, verdicts, STATUS lines, `worker_done`, and no "Orca" in briefs or agent files.

## v3.4.0

New `pr-reviewer` agent, a fifth column in the tier table (sonnet on light, opus otherwise). After the wrap-up, if every task passed, it runs `pr-review-toolkit:review-pr` once in auto mode and the orchestrator returns the output unchanged; nothing is fixed. `simplify` is left out because that agent edits code. In `/quest-herdr` it gets a fifth pane under the reviewer, and the close-panes question moves after it. Also fixes the tier tables' delimiter rows, which had one column too few.

## v3.3.0

`/quest-herdr`: agents now start with `--permission-mode auto` instead of `acceptEdits`, so first runs no longer block on permission prompts. Subagent mode is unchanged (subagents inherit the main session's mode).

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
