# Guild — v3.6.0 (Herdr and Orca panes)

Guild is a set of multi-agent workflows for Claude Code. Today it has one: `/quest`, the dev flow.

A small multi-agent workflow for Claude Code, installed once in your user folder and available in every project. Three ways to run it:

| Command | Where agents run | Use when |
|---|---|---|
| `/quest-herdr` | Each agent in its own Herdr pane — you watch them all work | You're inside Herdr |
| `/quest-orca` | Each agent in its own Orca pane, as a supervised Orca worker | You're inside an Orca terminal |
| `/quest` | Subagents inside one session | Anywhere else |

All three use the same five agent files, the same tiers and the same plan format.

## Install

macOS / Linux:
```bash
./scripts/install.sh
```

Or by hand, from inside this folder:
```bash
mkdir -p ~/.claude/agents ~/.claude/commands
cp agents/*.md   ~/.claude/agents/
cp commands/*.md ~/.claude/commands/
```

Windows (PowerShell):
```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\agents","$HOME\.claude\commands" | Out-Null
Copy-Item agents\*.md   "$HOME\.claude\agents\"
Copy-Item commands\*.md "$HOME\.claude\commands\"
```

Restart Claude Code, then check with `/agents` — the five agents should show under **User**.

The final PR review needs the `pr-review-toolkit` plugin from the official Claude plugin marketplace. Without it, the run still finishes and the last step reports that it could not run.

### Extra setup for the Herdr version
1. Install Herdr's Claude Code integration, so Herdr reports agent state (working / idle / blocked) reliably instead of guessing from the screen:
   ```bash
   herdr integration install claude
   ```
2. Let the orchestrator run `herdr` commands without asking every time. Add to `~/.claude/settings.json`:
   ```json
   { "permissions": { "allow": ["Bash(herdr *)"] } }
   ```
   (Merge into your existing `permissions.allow` list if you have one.)
3. Optional: install Herdr's agent skill as a safety net for the orchestrator. The command already follows its rules, so it works without it:
   ```bash
   npx skills add herdrdev/herdr --skill herdr -g
   ```

### Extra setup for the Orca version
1. Run Claude Code inside an Orca terminal. Orca puts its `orca` CLI on the PATH there and sets `ORCA_TERMINAL_HANDLE`, which the command checks for.
2. Let the orchestrator run `orca` commands without asking every time. Add to `~/.claude/settings.json`:
   ```json
   { "permissions": { "allow": ["Bash(orca *)"] } }
   ```
   (Merge into your existing `permissions.allow` list if you have one.)

## Using the Herdr version

Open a Herdr pane in your project, start `claude`, and run:
```
/quest-herdr Add pagination to GET /orders, 20 items per page by default
```

Layout it builds in the current tab (if your pane is under ~210 columns wide, it opens a new tab instead and says so, so the agents get the full width):
```
┌──────────────┬───────────┬───────────┐
│              │ analyst   │ developer │
│ orchestrator │           │           │
│   (you)      ├───────────┼───────────┤
│              │ tester    │ reviewer  │
│              │           ├───────────┤
│              │           │pr-reviewer│
└──────────────┴───────────┴───────────┘
```

How it works:
- Each agent is a real Claude Code session started with `claude --agent <role> --model <tier model>`, so it uses the same role file and tool limits as the subagent version.
- The orchestrator never pastes long prompts into panes. It writes a **brief** file and tells the agent "Read <brief> and do what it says". The agent writes its result to a **handoff** file. Everything is readable afterwards:
  ```
  .guild/<task>/
  ├── plan.md
  ├── briefs/     T1-dev-developer.md, T1-review-reviewer.md, …
  └── handoffs/   same names — what each agent concluded
  ```
- Agents start in `auto` permission mode, so they rarely ask. If one still blocks on a permission prompt, it waits **in that agent's pane**; the orchestrator notices the agent is blocked and tells you which pane needs you. It never approves anything on your behalf.
- Each session is named `<slug>-<role>` (e.g. `add-login-developer`), so you can reopen it later with `claude --resume <name>` or `/resume`.
- Agents stay alive for the whole run, so the developer remembers context across fix rounds. When the run ends, the panes stay open so you can scroll back; at the end the orchestrator asks whether to close them (it never closes anything on its own).

## Using the Orca version

Open an Orca terminal in your project, start `claude`, and run:
```
/quest-orca Add pagination to GET /orders, 20 items per page by default
```

The agents get their own tab, "quest <slug>", with the same grid (pr-reviewer under reviewer). You stay in your own tab and talk to the orchestrator there.

How it differs from the Herdr version:
- Each step is a **supervised Orca worker** task. Orca adds its own short preamble to the brief, telling the agent how to report back. The agent still writes the same handoff file, then sends `worker_done`.
- The orchestrator waits on Orca's mailbox (`check --wait`) and carries on as soon as a worker reports. You don't need to nudge it. While it waits you can't chat with it (press Escape to interrupt), same as in the Herdr version.
- A worker can **ask the orchestrator a question** mid-task. The orchestrator answers from the plan, or asks you and passes your answer on.
- Each quest gets its own Orca Run, so its messages never mix with other runs.
- If an agent gets stuck on a permission prompt or the first-run "trust this folder" dialog, the orchestrator tells you which pane needs you. It never answers for you.
- At the end it asks whether to close the agent panes, and closes nothing without your yes.

**Headroom (optional).** Add `--headroom` to route every agent through a running Headroom proxy:
```
/quest-orca --tier light --headroom Add pagination to GET /orders
```
Each pane then starts with `headroom wrap claude --no-proxy --port <port> --code-memory none -- --agent <role> …`. The proxy must already be up (start the orchestrator with `headroom wrap claude`, or run `headroom proxy`); the port comes from the orchestrator's `ANTHROPIC_BASE_URL`, else `$HEADROOM_PORT`, else 8787. Without the flag, agents run plain `claude`. Wrapped sessions can't use Remote Control (`/rc`).

## Tiers

The tier sets which model each agent runs on. Default is **standard**.

| Tier | analyst | developer | tester | reviewer | pr-reviewer |
|---|---|---|---|---|---|
| light | sonnet | sonnet | sonnet | sonnet | sonnet |
| standard | opus | sonnet | sonnet | opus | opus |
| complex | opus | opus | sonnet | opus | opus |

```
/quest-herdr --tier complex Replace the auth middleware with JWT validation
```

The table lives in each command file (`quest.md`, `quest-herdr.md`, `quest-orca.md`). The plan records the tier and models under `## Workflow`, every agent run is logged under `## Run log`, and the final summary repeats both. In the Herdr and Orca versions each pane is also labelled `<role> · <model>`.

## Flow

```
analyst ──► plan.md ──► YOU APPROVE
                           │
            ┌──────────────┘
            ▼   (per task)
        developer ──► tester ──► reviewer
            ▲                       │
            └── CHANGES_REQUESTED ──┘  (max 2 rounds, then escalate to you)
                                    │ PASS
                                    ▼
                               next task → summary → pr-reviewer → its output, unchanged, to you
```

| Agent | Job | Can edit code? |
|---|---|---|
| analyst | Understand the ask, requirements, acceptance criteria, task breakdown | Only writes the plan (Bash for read-only inspection) |
| developer | Implements one task at a time, applies review fixes | Yes |
| tester | Writes and runs tests after implementation | Tests only |
| reviewer | Checks against acceptance criteria, runs build + tests | No — only writes its handoff file |
| pr-reviewer | Runs `pr-review-toolkit:review-pr` once at the end (all aspects except `simplify`, which edits code) and returns the output. Nothing is fixed automatically | No — only writes its handoff file |

Extra tools beyond file/Bash access: all agents get `codegraph_explore` (used only if the project has `.codegraph/`); analyst, developer and reviewer also get the Figma read tools (`create_session` first) and analyst/developer get `Skill` (for `figma-design-to-code`). If an MCP server isn't installed, those tools are simply unavailable. Agents never get Herdr or Artifact tools, and the agent files never mention Herdr or Orca.

Plans and handoffs are git-ignored through `.git/info/exclude`, so `.gitignore` is never touched. Linters and formatters don't read that file, so they may still see `.guild/`. Agents ignore those findings and never edit lint/format config to hide them, and they run formatters in write mode only on the files they changed. Delete `.guild/` whenever you like.

## Known limits (Herdr version)
- At the start it lists panes left over from earlier runs and asks once whether to close them (never without your yes). Agent handles are `<slug>-<role>`, so leftovers don't block a new run; just don't reuse a slug that's still alive.
- The first time Claude Code opens a repo it may ask whether to trust the folder. The orchestrator tells you which pane is waiting; answer it there.
- On a narrow screen the 2×2 grid gets cramped; the orchestrator automatically puts the agents in a separate tab.
- If an agent's prompt looks unusual, Herdr may report it as idle instead of blocked. If the orchestrator seems stuck, check the agent panes.
- Long tasks: the orchestrator waits in 9-minute chunks (inside Claude Code's 10-minute limit for one command) and keeps waiting until the handoff file appears.

## Ideas for later
- Escalate a tier in the fix loop (e.g. retry on opus after 2 failed reviews)
- Run independent tasks in parallel, each developer in its own pane or worktree
- Git branch per task and auto-commit on PASS
- Pull tasks from GitHub/Jira issues
