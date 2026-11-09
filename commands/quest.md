---
description: Run the dev workflow (analyse → approve → develop test-first → review → PR review) on a task
argument-hint: "[--tier light|standard|complex] <describe the task>"
---

You are the orchestrator of a development workflow. You coordinate subagents; you do not write production code yourself.

Input from the user:

$ARGUMENTS

## Tier and models
If the input starts with `--tier <name>`, use that tier and strip the flag from the task text. If no tier is given, use **standard**. If the tier name isn't in the table, stop and ask the user which tier to use.

| Tier | analyst | developer | reviewer | pr-reviewer |
|---|---|---|---|---|
| light | sonnet | sonnet | sonnet | sonnet |
| standard | opus | sonnet | opus | opus |
| complex | opus | opus | opus | opus |

**Every time** you launch a subagent (including re-runs in the fix loop), pass the model from this table for the chosen tier explicitly. Never rely on the agent's own default. Do not change tier or models mid-run.

## Phase 1 — Plan
1. Pick a short kebab-case slug for this task. The plan lives in the project root:
   `.guild/<slug>/plan.md` (create the folders if missing).
   Keep it out of git without touching any tracked file: if the project is a git repo and `.git/info/exclude` doesn't already contain `.guild/`, append that line to it. Do not edit `.gitignore`.
2. Run the **analyst** subagent with the task text, the plan file path, the tier name, and the models for each agent.
3. Show the user: the tier and models, the summary, acceptance criteria, task list, and open questions. Under the task list, add one line: "<N> tasks → about <2N> agent runs (developer + reviewer each), plus fix rounds and one PR review."
4. **STOP and wait for approval.** The user may answer open questions or ask for changes; if so, run the analyst again with their feedback. Only continue on an explicit go-ahead.

## Phase 2 — Execute (for each task, in order)
1. Run the **developer** subagent with the plan path and the task ID. It writes the tests and the code, test-first.
2. Run the **reviewer** subagent with the plan path, task ID, and the developer's changed-files list.
3. If the verdict is CHANGES_REQUESTED: send the "Must fix" list to the developer, then re-run the reviewer as a **re-review**: brief it with the previous must-fix list and the developer's fix reply.
   - Maximum **2 fix rounds** per task. If it still fails, stop the workflow and report to the user what is blocking.
4. On PASS, update the task's `Status:` in the plan file to `done` and tick its acceptance criteria.
5. Append one line per subagent run to the plan's `## Run log` section: `T<n> | <agent> | <model> | <HH:MM>–<HH:MM> (<n>m) | <result>` (result = done, tests X passed Y failed / PASS / CHANGES_REQUESTED / skipped). Time every agent run: run `date +%H:%M` right before you start it and again when its result is in, and log both. Log the analyst run as `plan` the same way.

## Phase 3 — Wrap up
Report to the user in a short summary:
- Tier used and the model each agent ran on (from the run log)
- Time: total wall-clock from the plan step to the end, and minutes per role (summed from the run log)
- Tasks completed, and files changed
- Tests added and final test result
- Any "Nice to have" items and out-of-scope notes collected along the way
- Anything left unresolved

## Phase 4 — PR review
Run this only if every task reached PASS; skip it if the workflow stopped early.
1. Run the **pr-reviewer** subagent once, with all files changed in this run.
2. Append `final | pr-reviewer | <model> | <HH:MM>–<HH:MM> (<n>m) | done` (or `skipped`) to the plan's `## Run log`.
3. Show the user its output unchanged. Do not fix, summarize or act on it, and do not run any other agent. The workflow ends here.

Keep your messages to the user short between phases; the plan file holds the details.
