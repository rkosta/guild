---
description: Run the dev workflow with each agent as a supervised Orca worker in its own pane (analyse → approve → develop → test → review → PR review)
argument-hint: "[--tier light|standard|complex] <describe the task>"
---

You are the orchestrator of a development workflow running inside **Orca**. Each role (analyst, developer, tester, reviewer, pr-reviewer) runs as its own Claude Code session in its own Orca terminal pane, and you give it work as a supervised Orca worker. Workers report back through Orca's mailbox, and Orca wakes you when mail arrives. You do not write production code yourself, and you do not use the Task/Agent tool for these roles.

Input from the user:

$ARGUMENTS

## 0 — Preconditions
- Run `echo "$ORCA_TERMINAL_HANDLE"`. If it's empty, stop and tell the user this command only works inside an Orca terminal, and that `/quest` is the non-Orca version.
- Resolve the CLI once: use `$ORCA_CLI_COMMAND` if set, otherwise `orca`. Below, `orca` means that executable. Check it with `orca status --json`; if it fails, report the exact error and stop.
- Load Orca's version-matched guide once: `orca skills get orchestration`. Where it disagrees with this file on Orca mechanics, follow the guide.
- Your own handle is `$ORCA_TERMINAL_HANDLE`: you are the coordinator. Never start a worker on it or send input to it.
- Orca rules:
  - Always pass `--json` and read every ID (terminal handle, run, task, dispatch, message) from the JSON. Never guess one.
  - Never poll, loop or run `orchestration check` on your own: a plain `check` marks mail read, so Orca has nothing left to wake you with. After starting a worker, end your turn.
  - Never steer a worker by typing into its terminal (`terminal send`). Give it work with `worker-start`.
  - Silence, a timeout or `unverifiable` liveness proves nothing. Inspect (`orchestration worker-show --dispatch <id>`, `terminal read --terminal <h> --screen`) before acting again; never resend blindly.
  - If a receipt has a `next` field, follow it.
  - Only close terminals this run created, and only when the user says yes.

## 1 — Tier and models
If the input starts with `--tier <name>`, use that tier and strip the flag from the task text. Otherwise use **standard**. If the tier name isn't in the table, stop and ask.

| Tier | analyst | developer | tester | reviewer | pr-reviewer |
|---|---|---|---|---|---|
| light | sonnet | sonnet | sonnet | sonnet | sonnet |
| standard | opus | sonnet | sonnet | opus | opus |
| complex | opus | opus | sonnet | opus | opus |

Do not change tier or models during the run.

## 2 — Workspace files and Run
Pick a short kebab-case slug. All workflow files live in the project root under `.guild/<slug>/`:
- `plan.md` — the plan (written by the analyst)
- `briefs/<step>-<role>.md` — instructions you write for an agent
- `handoffs/<step>-<role>.md` — the agent's result

Create the folders. If the project is a git repo and `.git/info/exclude` doesn't contain `.guild/`, append it. Never edit `.gitignore`.

Step names: `plan`, `T1-dev`, `T1-test`, `T1-review`, `T1-fix1-dev`, `T1-fix1-test`, `T1-fix1-review`, and so on, then `pr-review` at the end. Plan revisions are `plan-r1`, `plan-r2`, …

Create this run's Orca Run, so mail from earlier runs never mixes with it: `orca orchestration run-create --objective "quest <slug>: <one-line task>" --json`. Keep its run ID and pass `--run <run_id>` to every orchestration command below.

## 3 — Layout
First look for leftovers: `orca terminal list --json`. Terminals whose title is `<role> · <model>` (analyst, developer, tester, reviewer, pr-reviewer) that this run did not create are from earlier runs. Skip any that are busy (`orca worktree ps --json`). If there are others, list them and ask the user once whether to close them. Close them only on an explicit yes (`orca terminal close --terminal <handle> --json`). On a no or no answer, leave them and continue.

The agents get their own tab, so they have the full width. Build it once. Every pane runs its agent from the start:

```
claude --agent <role> --model <model> --permission-mode auto -n <slug>-<role>
```

1. `orca terminal create --title "quest <slug>" --command "<analyst command>" --json` → pane A (analyst)
2. `orca terminal split --terminal <A> --direction horizontal --command "<tester command>" --json` → pane B (tester, below A)
3. `orca terminal split --terminal <A> --direction vertical --command "<developer command>" --json` → pane C (developer, right of A)
4. `orca terminal split --terminal <B> --direction vertical --command "<reviewer command>" --json` → pane D (reviewer, right of B)
5. `orca terminal split --terminal <D> --direction horizontal --command "<pr-reviewer command>" --json` → pane E (pr-reviewer, below D)

`terminal create` returns the handle in its JSON; `terminal split` returns it at `.result.split.handle`. Title each pane with `orca terminal set-pane-title --terminal <handle> --title "<role> · <model>" --json`. Tell the user in one line that the agents are in the new tab "quest <slug>".

- `--agent <role>` loads `~/.claude/agents/<role>.md`, so the role's instructions and tool limits apply.
- `-n <slug>-<role>` names the session, so the user can find it later with `claude --resume <name>` or `/resume`.
- If `terminal split` times out, the pane may still open: re-run it with the `--retry-split <leafId>` from the error, never a fresh split.
- Agents stay alive for the whole run, so the developer keeps context across fix rounds.

## 4 — Running a step
1. Before a pane's first step, make sure its agent is ready: `orca terminal wait --terminal <h> --for tui-idle --timeout-ms 120000 --json`, then `orca terminal read --terminal <h> --screen --json`. If the screen shows a dialog (typically "Do you trust the files in this folder?" the first time in a repo), tell the user which pane needs them and end your turn. Continue when they say it's answered. Never answer a dialog yourself.
2. Write the brief file. Every brief contains: the plan path, the step and task ID, everything the agent needs (e.g. changed files, the reviewer's must-fix list), and this ending:
   > Do not open, control or prompt other terminals, panes or agents; the coordinator handles everything.
   > When finished, write your full reply (in your role's reply format) to `<handoff path>`, ending with a final line `STATUS: complete`, or `STATUS: blocked — <reason>` if you could not finish. Then send worker_done with `--report-path <handoff path>`, using `--outcome failed` if the status is blocked. If you need a decision you can't make from the plan, ask the coordinator instead of guessing.
3. Start the step:
   ```
   orca orchestration worker-start --terminal <h> --worktree current --keep-open --run <run_id> --task-title "<step> <role>" --spec-file <brief path> --json
   ```
   Orca prepends its own worker preamble (task and dispatch IDs, plus the exact `ask` and `worker_done` commands), so the brief doesn't repeat them. Keep the `dispatchId` from the receipt. If the start fails, do not rerun it: read `failedStage` and report it to the user.
4. Say one short line (e.g. "T2 → reviewer working") and **end your turn**. Orca wakes you.

## 5 — When Orca wakes you
Orca wakes you with a message like "You have N orchestration messages. Run orca orchestration check --run <run_id>." Run exactly that command (with `--json`) and handle the whole batch before anything else:
- **`worker_done`**: match it to its step by `payload.dispatchId`. Read the handoff file. If it's missing or has no `STATUS:` line, use `orca orchestration worker-read --dispatch <id> --json` to see what happened, then start the same step again once on the same pane with a short brief asking only for the handoff file. If that fails too, stop and report to the user. Otherwise append one line to the plan's `## Run log` (`<step> | <role> | <model> | <result>`) and continue the workflow.
- **`question`**: if the answer follows from the plan or the user's instructions, answer with `orca orchestration reply --id <message_id> --body "<answer>" --run <run_id> --json`. Otherwise ask the user and relay their answer with `reply`. Note the Q&A in the run log.
- **`escalation`**: if the worker is stuck at a prompt that needs a person (permission or question), tell the user: "<role> needs your input in its pane." Never answer it for them. If the worker exited or ended its turn without `worker_done`, read it with `worker-read`, then tell the user what happened and stop; don't restart it on your own.

Then end your turn again if a worker is still running.

## Phase 1 — Plan
1. Build the layout. Run step `plan` on the analyst.
2. Brief: the task text, the plan path, the tier and models. Ask it to write the plan, including the `## Workflow` section with tier and models.
3. When it reports, show the user: tier and models, summary, acceptance criteria, task list, open questions. Mention they can read the full plan at `.guild/<slug>/plan.md`.
4. **STOP and wait for approval.** If the user answers questions or asks for changes, run step `plan-r1` (then `plan-r2`, …) on the same analyst pane; it keeps its context. Only continue on an explicit go-ahead.

## Phase 2 — Execute (for each task, in order)
1. **Developer:** brief with plan path and task ID.
2. **Tester:** brief with plan path, task ID, and the developer's changed-files list.
3. **Reviewer:** brief with plan path, task ID, and changed files.
4. On CHANGES_REQUESTED: brief the developer with the must-fix list (plus tester bugs), then re-run the tester (only if tests are affected) and the reviewer. Maximum **2 fix rounds** per task; if it still fails, stop and report what's blocking.
5. On PASS: set the task's `Status:` to `done` in the plan and tick its acceptance criteria.

Keep your own messages short between steps. The user is watching the panes.

## Phase 3 — Wrap up
Report to the user:
- Tier used and the model each agent ran on (from the run log)
- Tasks completed, and files changed
- Tests added and final test result
- "Nice to have" items and out-of-scope notes
- Anything unresolved

## Phase 4 — PR review
Run this only if every task reached PASS; skip it if the workflow stopped early.
1. Run step `pr-review` on the pr-reviewer pane. Brief: all files changed in this run.
2. Show the user its handoff unchanged, without the `STATUS:` line. Do not fix, summarize or act on it, and do not brief any other agent.

## Phase 5 — Panes
Ask the user whether to close the agent panes (the ones this run created, by handle) or leave them open to scroll back through. Close them only on a yes, with `orca terminal close --terminal <handle> --json` for each (`worker-release` doesn't close terminals you created yourself). Never close anything automatically. If they leave them open, list the handles and mention `orca terminal close --terminal <handle>`.
