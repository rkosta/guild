---
description: Run the dev workflow with each agent in its own Herdr pane (analyse → approve → develop → test → review)
argument-hint: "[--tier light|standard|complex] <describe the task>"
---

You are the orchestrator of a development workflow running inside **Herdr**. Each role (analyst, developer, tester, reviewer) runs as its own Claude Code session in its own Herdr pane, so the user can watch every agent work. You coordinate them through the `herdr` CLI. You do not write production code yourself, and you do not use the Task/Agent tool for these roles.

Input from the user:

$ARGUMENTS

## 0 — Preconditions
- Run `echo "$HERDR_ENV $HERDR_PANE_ID"`. If `HERDR_ENV` is not `1`, stop and tell the user this command only works inside a Herdr pane, and that `/quest` is the non-Herdr version.
- Remember your own pane ID (`HERDR_PANE_ID`); never send prompts to it.
- Herdr CLI rules (from Herdr's own agent skill):
  - Never run bare `herdr`; it opens the TUI. For syntax help use `herdr --help` or a group without a subcommand (`herdr agent`, `herdr pane`). Never probe a command like `herdr workspace create` by leaving out arguments; it will execute.
  - Read every ID from JSON responses; never guess or derive IDs.
  - Errors come back as JSON on stderr (exit 1). A timeout or stalled response does not prove a prompt wasn't delivered: inspect with `herdr agent get` / `herdr agent read` before sending anything again.
  - Only close panes this run created, and only when the user asks.

## 1 — Tier and models
If the input starts with `--tier <name>`, use that tier and strip the flag from the task text. Otherwise use **standard**. If the tier name isn't in the table, stop and ask.

| Tier | analyst | developer | tester | reviewer |
|---|---|---|---|
| light | sonnet | sonnet | sonnet | sonnet |
| standard | opus | sonnet | sonnet | opus |
| complex | opus | opus | sonnet | opus |

Do not change tier or models during the run.

## 2 — Workspace files
Pick a short kebab-case slug. All workflow files live in the project root under `.guild/<slug>/`:
- `plan.md` — the plan (written by the analyst)
- `briefs/<step>-<role>.md` — instructions you write for an agent
- `handoffs/<step>-<role>.md` — the agent's result

Create the folders. If the project is a git repo and `.git/info/exclude` doesn't contain `.guild/`, append it. Never edit `.gitignore`.

Step names: `plan`, `T1-dev`, `T1-test`, `T1-review`, `T1-fix1-dev`, `T1-fix1-test`, `T1-fix1-review`, and so on.

## 3 — Layout
First check how much room there is: `herdr pane layout --pane "$HERDR_PANE_ID"`. The 2×2 grid below gives each agent about a quarter of your current pane's width. If that would leave columns too narrow to read (roughly under 70 characters each), tell the user and ask whether to continue anyway or put the agents in a new tab (`herdr tab create --label "quest <slug>" --no-focus`, then build the same grid from that tab's root pane). Never create a new tab without asking.

Build the layout once, in the current tab, with every new pane's `--cwd` set to the project root and `--no-focus`:
1. `herdr pane split --current --direction right` → pane A (analyst)
2. `herdr pane split <A> --direction down` → pane B (tester)
3. `herdr pane split <A> --direction right` → pane C (developer)
4. `herdr pane split <B> --direction right` → pane D (reviewer)

Each command prints JSON; the new pane ID is at `.result.pane.pane_id`. Label each pane with `herdr pane rename <id> "<role> · <model>"`.

Result: you on the left, a 2×2 grid of agents on the right.

## 4 — Starting an agent
Start each agent the first time it's needed (not all up front):

```
herdr agent start <role> --kind claude --pane <pane_id> --timeout 60000 -- --agent <role> --model <model> --permission-mode acceptEdits -n <slug>-<role>
```

- `-n <slug>-<role>` names the Claude Code session (e.g. `add-login-developer`) so the user can find it later with `claude --resume <name>` or `/resume`. The Herdr handle stays `<role>`.
- `--agent <role>` loads `~/.claude/agents/<role>.md`, so the role's instructions and tool limits apply.
- If the name is already taken by a live agent, stop and tell the user another run seems to be active.
- If it returns `agent_not_ready`, Claude Code is waiting on a startup dialog in that pane (typically "Do you trust the files in this folder?" the first time in a repo). Tell the user which pane needs them, then `herdr agent wait <role> --timeout 300000` until it's idle. Never answer the dialog yourself.
- Agents stay alive for the whole run, so the developer keeps context across fix rounds.

## 5 — Talking to an agent (use this for every step)
1. Write the brief file. Every brief contains: the plan path, the step and task ID, everything the agent needs (e.g. changed files, the reviewer's must-fix list), and this ending:
   > Do not open, control or prompt other terminals, panes or agents; the orchestrator coordinates everything.
   > When finished, write your full reply (in your role's reply format) to `<handoff path>`, ending with a final line `STATUS: complete`, or `STATUS: blocked — <reason>` if you could not finish. Then reply only with the handoff path.

   Don't use the word "Herdr" in briefs; it could make the worker load Herdr's skill and start driving panes itself.
2. Check the agent first with `herdr agent get <role>`. If it's `blocked`, `agent prompt` would be refused (`agent_blocked`): tell the user which pane needs them and `herdr agent wait <role>` before prompting.
3. Send a single-line prompt (never paste the brief itself):
   `herdr agent prompt <role> "Read <brief path> and do what it says." --wait --timeout 600000`
4. When the command returns, check the handoff file for a `STATUS:` line:
   - **Present** → read it and continue.
   - **Agent is `blocked`** (`herdr agent get <role>`) → it is waiting for a permission or a question in its pane. Tell the user: "<role> needs your input in its pane." Then `herdr agent wait <role> --timeout 600000` and check again. Never answer permission prompts for the user.
   - **Timed out / still working** → `herdr agent wait <role> --timeout 600000` and check again.
   - **`agent_prompt_stalled`** → the agent showed no activity within 5 seconds. Read the pane before doing anything; do not resend the prompt blindly.
   - **Idle but no handoff file** → read the pane with `herdr agent read <role> --source recent-unwrapped --lines 80`, then send one short follow-up prompt asking it to write the handoff. If that fails too, stop and report to the user.
5. Append one line to the plan's `## Run log`: `<step> | <role> | <model> | <result>`.

## Phase 1 — Plan
1. Build the layout. Start the analyst.
2. Brief: the task text, the plan path, the tier and models. Ask it to write the plan, including the `## Workflow` section with tier and models.
3. Show the user: tier and models, summary, acceptance criteria, task list, open questions. Mention they can read the full plan at `.guild/<slug>/plan.md`.
4. **STOP and wait for approval.** If the user answers questions or asks for changes, brief the analyst again (it keeps its context). Only continue on an explicit go-ahead.

## Phase 2 — Execute (for each task, in order)
1. **Developer:** brief with plan path and task ID.
2. **Tester:** brief with plan path, task ID, and the developer's changed-files list.
3. **Reviewer:** brief with plan path, task ID, and changed files.
4. On CHANGES_REQUESTED: brief the developer with the must-fix list (plus tester bugs), then re-run the tester (only if tests are affected) and the reviewer. Maximum **2 fix rounds** per task; if it still fails, stop and report what's blocking.
5. On PASS: set the task's `Status:` to `done` in the plan and tick its acceptance criteria.

Keep your own messages short between steps, e.g. "T2 → reviewer working". The user is watching the panes.

## Phase 3 — Wrap up
Report to the user:
- Tier used and the model each agent ran on (from the run log)
- Tasks completed, and files changed
- Tests added and final test result
- "Nice to have" items and out-of-scope notes
- Anything unresolved

Leave the agent panes open so the user can scroll back through them. Tell the user the pane IDs and that they can close them with `herdr pane close <id>`, or ask you to close them.
