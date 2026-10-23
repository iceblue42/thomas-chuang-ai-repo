#!/usr/bin/env bash
# Keeps this repo and GitHub in step with the live skills, plugins and mods.
#   sync.sh push  - copy live sources in, commit any change, push (Stop hook)
#   sync.sh pull  - fast-forward from GitHub (SessionStart hook)
# Errors go to .git/autosync.log.
set -u
REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO" || exit 0
LOG="$REPO/.git/autosync.log"
exec 2>>"$LOG"

# One run at a time across sessions; a lock older than 10 minutes is stale.
LOCK="$REPO/.git/autosync.lock"
[ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ] && rmdir "$LOCK"
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK"' EXIT

if [ "${1:-push}" = pull ]; then
  git pull --ff-only -q
  exit 0
fi

# Mirror a live folder into the repo. Skipped when the live folder is a link into this repo.
mirror() {
  [ -d "$1" ] && [ ! -L "$1" ] || return 0
  robocopy "$(cygpath -w "$1")" "$(cygpath -w "$2")" //MIR //NJH //NJS //NFL //NDL //NP >/dev/null
  [ $? -lt 8 ] || echo "$(date) robocopy failed: $1" >&2
}

MP="$HOME/.claude/my-plugins"
for p in multi-agent-building multi-agent-building-local; do mirror "$MP/$p" "$REPO/Skills and Plugins/$p"; done
for p in progress-tracker token-weather handoff pager no-handbacks; do mirror "$MP/$p" "$REPO/Mods/$p"; done
mirror "$HOME/.claude/skills/patchnotes" "$REPO/Skills and Plugins/patchnotes"
# claude.ai skills: claude.ai is the source of truth and syncs them down to every device.
for s in eli5 laymanize shopping-assistant tommy-style; do
  for d in "$HOME"/.claude/skills/synced/*/"$s"; do mirror "$d" "$REPO/Skills and Plugins/$s"; done
done

git add -A
if ! git diff --cached --quiet; then
  what=$(git diff --cached --name-only | awk -F/ '{print (NF>1 ? $2 : $1)}' | sort -u | paste -sd, -)
  git commit -q -m "chore(auto-sync): update ${what:-repo}"
fi
if [ -n "$(git log @{u}.. --oneline 2>/dev/null)" ]; then
  git pull --rebase -q || { git rebase --abort; echo "$(date) rebase conflict, push skipped" >&2; exit 0; }
  git push -q
fi
