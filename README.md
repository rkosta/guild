# Guild — v3.1 (Herdr panes)

Guild is a set of multi-agent workflows for Claude Code. Today it has one: `/quest`, the dev flow.

A small multi-agent workflow for Claude Code, installed once in your user folder and available in every project. Two ways to run it:

| Command | Where agents run | Use when |
|---|---|---|
| `/quest-herdr` | Each agent in its own Herdr pane — you watch them all work | You're inside Herdr |
| `/quest` | Subagents inside one session | Anywhere else |

Both use the same four agent files, the same tiers and the same plan format.

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

Restart Claude Code, then check with `/agents` — the four agents should show under **User**.

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

## Using the Herdr version

Open a Herdr pane in your project, start `claude`, and run:
```
/quest-herdr Add pagination to GET /orders, 20 items per page by default
```

Layout it builds in the current tab:
```
┌──────────────┬───────────┬───────────┐
│              │ analyst   │ developer │
│ orchestrator │           │           │
│   (you)      ├───────────┼───────────┤
│              │ tester    │ reviewer  │
│              │           │           │
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
- Agents start with `acceptEdits`, so file edits don't ask. Shell commands (build, tests) still ask for permission **in that agent's pane**. The orchestrator notices the agent is blocked and tells you which pane needs you. It never approves anything on your behalf.
- Each session is named `<slug>-<role>` (e.g. `add-login-developer`), so you can reopen it later with `claude --resume <name>` or `/resume`.
- Agents stay alive for the whole run, so the developer remembers context across fix rounds. When the run ends, the panes stay open so you can scroll back; close them with `herdr pane close <id>` or ask the orchestrator.

## Tiers

The tier sets which model each agent runs on. Default is **standard**.

| Tier | analyst | developer | tester | reviewer |
|---|---|---|---|---|
| light | sonnet | sonnet | sonnet | sonnet |
| standard | opus | sonnet | sonnet | opus |
| complex | opus | opus | sonnet | opus |

```
/quest-herdr --tier complex Replace the auth middleware with JWT validation
```

The table lives in each command file (`quest.md`, `quest-herdr.md`). The plan records the tier and models under `## Workflow`, every agent run is logged under `## Run log`, and the final summary repeats both. In the Herdr version each pane is also labelled `<role> · <model>`.

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
                               next task → summary
```

| Agent | Job | Can edit code? |
|---|---|---|
| analyst | Understand the ask, requirements, acceptance criteria, task breakdown | Only writes the plan |
| developer | Implements one task at a time, applies review fixes | Yes |
| tester | Writes and runs tests after implementation | Tests only |
| reviewer | Checks against acceptance criteria, runs build + tests | No — only writes its handoff file |

Extra tools beyond file/Bash access: all agents get `codegraph_explore` (used only if the project has `.codegraph/`); analyst, developer and reviewer also get the Figma read tools (`create_session` first) and analyst/developer get `Skill` (for `figma-design-to-code`). If an MCP server isn't installed, those tools are simply unavailable. Agents never get Herdr or Artifact tools.

Plans and handoffs are git-ignored through `.git/info/exclude`, so `.gitignore` is never touched. Delete `.guild/` whenever you like.

## Known limits (Herdr version)
- Only one run at a time per Herdr session (agent names must be unique).
- The first time Claude Code opens a repo it may ask whether to trust the folder. The orchestrator tells you which pane is waiting; answer it there.
- On a narrow screen the 2×2 grid gets cramped; the orchestrator checks and offers a separate tab instead.
- If an agent's prompt looks unusual, Herdr may report it as idle instead of blocked. If the orchestrator seems stuck, check the agent panes.
- Long tasks: the orchestrator waits in 10-minute chunks and keeps waiting until the handoff file appears.

## Ideas for later
- Escalate a tier in the fix loop (e.g. retry on opus after 2 failed reviews)
- Run independent tasks in parallel, each developer in its own pane or worktree
- Git branch per task and auto-commit on PASS
- Pull tasks from GitHub/Jira issues
