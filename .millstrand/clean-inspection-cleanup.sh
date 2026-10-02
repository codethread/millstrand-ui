#!/usr/bin/env bash
set -euo pipefail

branch=${1-}
worktree=${2-}
canonical_root=${3-}
expected_head=${4-}
wktree_bin=${WKTREE_BIN:-wktree}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ -n "$branch" && -n "$worktree" && -n "$canonical_root" && -n "$expected_head" ]] \
  || fail "usage: clean-inspection-cleanup BRANCH WORKTREE CANONICAL_ROOT EXPECTED_HEAD"
[[ "$branch" != main ]] || fail "refusing to remove main"
[[ "$expected_head" =~ ^[0-9a-fA-F]{40}$ ]] || fail "expected HEAD must be a full Git SHA"
command -v python3 >/dev/null 2>&1 || fail "python3 is required to inspect wktree output"
command -v "$wktree_bin" >/dev/null 2>&1 || fail "wktree is required for cleanup lifecycle"

canonical_root=$(cd "$canonical_root" && pwd -P)
worktree=$(python3 - "$worktree" <<'PY'
import os
import sys
print(os.path.realpath(sys.argv[1]))
PY
)
[[ "$(git -C "$canonical_root" branch --show-current)" == main ]] \
  || fail "canonical checkout must be on main"

inventory=$($wktree_bin list --json)
if [[ ! -e "$worktree" ]]; then
  python3 - "$inventory" "$worktree" "$branch" <<'PY'
import json
import os
import sys
items = json.loads(sys.argv[1])
path = os.path.realpath(sys.argv[2])
branch = sys.argv[3]
matches = [item for item in items
           if os.path.realpath(item.get("path", "")) == path
           or item.get("branch") == branch]
if matches:
    raise SystemExit("wktree still records the absent cleanup resource")
PY
  if git -C "$canonical_root" show-ref --verify --quiet "refs/heads/$branch"; then
    [[ "$(git -C "$canonical_root" rev-parse "refs/heads/$branch")" == "$expected_head" ]] \
      || fail "remaining branch does not match the recorded HEAD"
    [[ "$(git -C "$canonical_root" rev-list --count "origin/main..refs/heads/$branch")" == 0 ]] \
      || fail "remaining branch has commits ahead of origin/main"
    git -C "$canonical_root" branch -D "$branch"
    printf 'completed inspected interrupted cleanup: branch=%s worktree=%s\n' "$branch" "$worktree"
  else
    printf 'cleanup already complete: branch=%s worktree=%s\n' "$branch" "$worktree"
  fi
  exit 0
fi

worktree=$(cd "$worktree" && pwd -P)
python3 - "$inventory" "$worktree" "$branch" <<'PY'
import json
import os
import sys
items = json.loads(sys.argv[1])
path = os.path.realpath(sys.argv[2])
branch = sys.argv[3]
matches = [item for item in items
           if os.path.realpath(item.get("path", "")) == path
           and item.get("branch") == branch]
if len(matches) != 1:
    raise SystemExit("wktree inventory does not contain the exact branch worktree")
item = matches[0]
if item.get("canonical") or item.get("detached") or item.get("locked"):
    raise SystemExit("wktree inventory marks the cleanup worktree unsafe")
PY

common_dir=$(git -C "$worktree" rev-parse --path-format=absolute --git-common-dir)
[[ "$(cd "$(dirname "$common_dir")" && pwd -P)" == "$canonical_root" ]] \
  || fail "worktree does not belong to the canonical checkout"
[[ "$(git -C "$worktree" branch --show-current)" == "$branch" ]] \
  || fail "worktree is not on the recorded branch"
[[ "$(git -C "$worktree" rev-parse HEAD)" == "$expected_head" ]] \
  || fail "worktree does not match the recorded HEAD"
[[ -z "$(git -C "$worktree" status --porcelain --untracked-files=all)" ]] \
  || fail "tracked or untracked files prevent clean inspection cleanup"
[[ "$(git -C "$worktree" rev-list --count origin/main..HEAD)" == 0 ]] \
  || fail "branch has commits ahead of origin/main"

# Inspect compact ignored entries, then let one Git clean remove the allowlisted
# disposable set. `normal` collapses ignored directories instead of enumerating
# every file under node_modules.
while IFS= read -r -d '' entry; do
  status=${entry:0:2}
  path=${entry:3}
  [[ "$status" == "!!" ]] || fail "unexpected git status entry: $entry"
  case "$path" in
    .DS_Store|*/.DS_Store|*.tsbuildinfo|node_modules/|*/node_modules/|dist/|*/dist/|coverage/|*/coverage/)
      ;;
    *)
      fail "unknown ignored file prevents cleanup: $path"
      ;;
  esac
done < <(git -C "$worktree" status --porcelain=v1 -z --ignored --untracked-files=normal)

git -C "$worktree" clean -fdX
[[ -z "$(git -C "$worktree" status --porcelain --ignored --untracked-files=normal)" ]] \
  || fail "worktree is not empty after disposable artifact cleanup"

removed=$($wktree_bin remove --branch "$branch" --json)
python3 - "$removed" "$worktree" <<'PY'
import json
import os
import sys
result = json.loads(sys.argv[1])
path = os.path.realpath(sys.argv[2])
if (result.get("kind") != "ready"
        or result.get("removed") is not True
        or os.path.realpath(result.get("worktree_path", "")) != path):
    raise SystemExit("wktree did not confirm exact worktree removal")
PY
printf 'clean inspection resources removed through wktree: branch=%s worktree=%s\n' "$branch" "$worktree"
