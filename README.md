# thomas-chuang-ai-repo
Repository of AI skills and mods developed by Thomas Chuang

## Contents

| Folder | What | Installed on this device from |
|---|---|---|
| `Skills and Plugins/multi-agent-building` | MAB plugin (skill + agents) | `~/.claude/my-plugins/multi-agent-building` (local marketplace `tommy-local`) |
| `Skills and Plugins/multi-agent-building-local` | MAB local (qwen) plugin | `~/.claude/my-plugins/multi-agent-building-local` (local marketplace `tommy-local-mabl`) |
| `Skills and Plugins/eli5`, `laymanize`, `shopping-assistant`, `tommy-style` | claude.ai skills (`anthropic-skills:*`) | uploaded on claude.ai, synced down automatically |
| `Mods/progress-tracker` | Project plan / MAB run tracker | `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` |
| `Mods/token-weather` | Context-usage forecast in the band above the prompt | `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` |

## New device setup

1. Clone: `git clone https://github.com/iceblue42/thomas-chuang-ai-repo.git`
2. MAB plugins: in Claude Code, `/plugin marketplace add "<clone>/Skills and Plugins/multi-agent-building"`, then `/plugin install multi-agent-building@tommy-local` (same for `-local`).
3. Mods: add each `Mods/<name>` folder to `CLAUDE_CODE_PLUGIN_DIRS` (`;`-separated) under `env` in `~/.claude/settings.json`.
4. claude.ai skills: already synced if signed in to the same account; otherwise upload the folder as a skill on claude.ai.

To update: `git pull`.
