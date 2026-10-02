#!/usr/bin/env bash
set -euo pipefail

branch=${1-}
worktree=${2-}
canonical_root=${3-}
expected_head=${4-}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ -n "$branch" && -n "$worktree" && -n "$canonical_root" && -n "$expected_head" ]] \
  || fail "usage: clean-inspection-cleanup BRANCH WORKTREE CANONICAL_ROOT EXPECTED_HEAD"
[[ "$branch" != main ]] || fail "refusing to remove main"
[[ "$expected_head" =~ ^[0-9a-fA-F]{40}$ ]] || fail "expected HEAD must be a full Git SHA"

canonical_root=$(cd "$canonical_root" && pwd -P)
[[ "$(git -C "$canonical_root" branch --show-current)" == main ]] \
  || fail "canonical checkout must be on main"

if [[ ! -e "$worktree" ]]; then
  if git -C "$canonical_root" show-ref --verify --quiet "refs/heads/$branch"; then
    [[ "$(git -C "$canonical_root" rev-parse "refs/heads/$branch")" == "$expected_head" ]] \
      || fail "remaining branch does not match the recorded HEAD"
    [[ "$(git -C "$canonical_root" rev-list --count "origin/main..refs/heads/$branch")" == 0 ]] \
      || fail "remaining branch has commits ahead of origin/main"
    git -C "$canonical_root" branch -D "$branch"
    printf 'completed interrupted cleanup: branch=%s worktree=%s\n' "$branch" "$worktree"
  else
    printf 'cleanup already complete: branch=%s worktree=%s\n' "$branch" "$worktree"
  fi
  exit 0
fi

worktree=$(cd "$worktree" && pwd -P)
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

# Seed the array for macOS Bash 3.2 under `set -u`; an empty Git path is invalid.
ignored=("")
while IFS= read -r -d '' entry; do
  status=${entry:0:2}
  path=${entry:3}
  [[ "$status" == "!!" ]] || fail "unexpected git status entry: $entry"
  case "$path" in
    .DS_Store|*/.DS_Store|*.tsbuildinfo|node_modules/|*/node_modules/|node_modules/*|*/node_modules/*|dist/|*/dist/|dist/*|*/dist/*|coverage/|*/coverage/|coverage/*|*/coverage/*)
      ignored+=("$path")
      ;;
    *)
      fail "unknown ignored file prevents cleanup: $path"
      ;;
  esac
done < <(git -C "$worktree" status --porcelain=v1 -z --ignored --untracked-files=all)

for path in "${ignored[@]}"; do
  [[ -z "$path" ]] || rm -rf -- "$worktree/$path"
done

[[ -z "$(git -C "$worktree" status --porcelain --ignored --untracked-files=all)" ]] \
  || fail "worktree is not empty after disposable artifact cleanup"

git -C "$canonical_root" worktree remove "$worktree"
git -C "$canonical_root" branch -D "$branch"
printf 'clean inspection resources removed: branch=%s worktree=%s\n' "$branch" "$worktree"
