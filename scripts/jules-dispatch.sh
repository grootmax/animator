#!/usr/bin/env bash
# Send one task brief to Jules as a new remote session.
# Usage: scripts/jules-dispatch.sh M0-1   (reads docs/jules/tasks/M0-1-*.md)
# Requires the Jules CLI (npm i -g @google/jules) and `jules login`.
set -euo pipefail

REPO="${JULES_REPO:-grootmax/animator}"
id="${1:?usage: $0 <task-id>   e.g. M0-1}"
root="$(git rev-parse --show-toplevel)"

shopt -s nullglob
raw_matches=("$root"/docs/jules/tasks/"$id"-*.md "$root"/docs/jules/tasks/"$id".md)
matches=()
for f in "${raw_matches[@]}"; do
  [ -f "$f" ] && matches+=("$f")
done
if [ "${#matches[@]}" -ne 1 ]; then
  echo "expected exactly one brief for $id, found ${#matches[@]}" >&2
  exit 1
fi
brief="${matches[0]}"
rel="${brief#"$root"/}"

command -v jules >/dev/null || { echo "jules CLI not found: npm i -g @google/jules && jules login" >&2; exit 1; }

prompt="You are the implementer on Animator. Follow AGENTS.md and docs/PROJECT_CONTEXT.md.
Your task brief is the file $rel on main; it is reproduced below. Do only this task, on the branch it names,
in one PR. Put the brief path in the PR description.

$(cat "$brief")"

echo "Dispatching $rel to Jules on $REPO ..."
jules remote new --repo "$REPO" --session "$prompt"
