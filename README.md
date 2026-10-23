# thomas-chuang-ai-repo
Repository of AI skills and mods developed by Thomas Chuang

## Contents

| Folder | What |
|---|---|
| `Skills and Plugins/multi-agent-building` | MAB plugin (skill + agents), local marketplace `tommy-local` |
| `Skills and Plugins/multi-agent-building-local` | MAB local (qwen) plugin, local marketplace `tommy-local-mabl` |
| `Skills and Plugins/eli5`, `laymanize`, `shopping-assistant`, `tommy-style` | claude.ai skills (`anthropic-skills:*`) |
| `Mods/progress-tracker` | Project plan / MAB run tracker |
| `Mods/token-weather` | Context-usage forecast in the band above the prompt |
| `Mods/handoff` | `/handoff` next-session prompt |
| `Mods/pager` | MAB status line, stall detection, `/away` |
| `Mods/no-handbacks` | Stops Claude handing back work it can do itself |

## How syncing works

- The plugins and mods live **in this repo**. `~/.claude/my-plugins/<name>` is a junction pointing here, so editing either path edits the repo.
- The claude.ai skills are edited on claude.ai, which syncs them to `~/.claude/skills/synced`; `sync.sh` copies them in.
- `sync.sh push` runs on every Claude Code **Stop** hook: commit any change, push to GitHub.
- `sync.sh pull` runs on every **SessionStart** hook: fast-forward from GitHub.
- Problems are logged to `.git/autosync.log`.

## New device setup

Run in PowerShell (clone to the same path so the hooks match, or edit the paths):

```powershell
git clone https://github.com/iceblue42/thomas-chuang-ai-repo.git "E:\Claude\Tommy's AI Repository"
```

```powershell
$repo = "E:\Claude\Tommy's AI Repository"; $mp = "$env:USERPROFILE\.claude\my-plugins"; New-Item -ItemType Directory -Force $mp | Out-Null; foreach ($p in 'multi-agent-building','multi-agent-building-local') { New-Item -ItemType Junction -Path "$mp\$p" -Target "$repo\Skills and Plugins\$p" }; foreach ($p in 'progress-tracker','token-weather','handoff','pager','no-handbacks') { New-Item -ItemType Junction -Path "$mp\$p" -Target "$repo\Mods\$p" }
```

Then in `~/.claude/settings.json`:
1. `env.CLAUDE_CODE_PLUGIN_DIRS`: the five `~/.claude/my-plugins/<mod>` paths, `;`-separated.
2. `hooks.Stop`: `bash "E:/Claude/Tommy's AI Repository/sync.sh" push` (async). `hooks.SessionStart`: same with `pull`.

And in Claude Code: `/plugin marketplace add ~/.claude/my-plugins/multi-agent-building`, then `/plugin install multi-agent-building@tommy-local` (same for `-local` / `tommy-local-mabl`).

claude.ai skills arrive automatically when signed in to the same account.
