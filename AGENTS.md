# AGENTS.md

Instructions for AI coding agents and humans contributing to this repo.
Project-specific rules in this repo's docs/wiki take precedence over anything below.

## 1. Surgical commits

- One logical change per commit. If you can't describe a commit in one sentence, split it.
- Stage deliberately. Use `git add -p` (or add specific files/hunks). Never `git add -A` or `git add .` blindly.
- No drive-by reformatting, renames, or refactors mixed into a functional change. If you notice something that needs cleanup while working, do it as its own commit, or note it instead (see Scope discipline).
- Commit message format:
  - Subject: imperative mood, ≤72 chars, prefixed with the task ID when one exists (e.g. `T-113: fix off-by-one in pagination`).
  - Body: explain *why*, not just what. Reference context a reviewer won't otherwise have.
- Each commit should build and pass tests where practical — don't leave intermediate commits in a broken state on shared branches.
- Don't rewrite shared/pushed history that others may have based work on.
- Force-push only to your own unmerged branch, and only with `--force-with-lease` (never bare `--force`).

## 2. One branch, one PR, per task

- One task = one branch = one PR. Don't bundle unrelated tasks.
- Branch naming: `<task-id>-<short-slug>` (e.g. `T-113-fix-pagination`).
- Always branch from an up-to-date `origin/main`:
  ```
  git fetch origin
  git checkout -b <task-id>-<short-slug> origin/main
  ```
- Keep PRs small — roughly 400 changed lines as a guide. Split larger work into sequential PRs.
- PR body references the issue (`Closes #N`) and includes test notes: what you tested, how, and what you didn't.
- To incorporate upstream changes, rebase on main; don't merge main into your branch.
  ```
  git fetch origin
  git rebase origin/main
  ```
- Never commit directly to `main`.
- Don't merge your own PR unless the project's workflow explicitly allows it — default to waiting for review.

## 3. Git worktrees for parallel work

When you have multiple independent tasks, give each its own worktree instead of stashing or switching branches in place.

A task is parallelizable when it:
- touches a disjoint set of files from other in-flight tasks (no shared files),
- has no dependency on another task's unmerged changes,
- doesn't require the same generated/build artifacts to be in a particular state at the same time.

If two tasks touch the same file or one needs the other's output first, do them sequentially instead.

Rules:
- One agent (or one person) per worktree. Never edit another agent's worktree.
- Install dependencies separately in each worktree — don't assume a shared `node_modules`/`venv`/etc. unless your tooling explicitly supports sharing.
- Clean up after merge: remove the worktree and prune stale metadata.

Cheat-sheet:
```
# create a new worktree + branch for a task, based on up-to-date main
git fetch origin
git worktree add ../<repo>-wt/<branch> -b <branch> origin/main

# list active worktrees
git worktree list

# after the PR merges: remove the worktree, then prune bookkeeping
git worktree remove ../<repo>-wt/<branch>
git worktree prune

# force-remove a worktree with uncommitted changes (only if you're sure)
git worktree remove --force ../<repo>-wt/<branch>
```

## 4. Scope discipline

- Stay inside the task you were given. Don't fix unrelated bugs, upgrade unrelated dependencies, or "improve while you're in there."
- If you spot an out-of-scope issue, note it on the relevant issue or PR (as a comment or a new issue) instead of fixing it inline.
- If a task turns out to require out-of-scope changes to complete, stop and flag it rather than silently expanding the diff.

## 5. Attribution

- Do not add `Co-Authored-By` trailers to commits.
- Do not add "Generated with ..." or similar AI-attribution lines to commits, PR descriptions, or issue text.
- Commits, PRs, and issues should read as if written by the contributor, with no tooling byline.

## 6. Secrets and data

- Never commit secrets, API keys, tokens, credentials, `.env` files, HAR captures, database dumps, or personally identifiable information (PII).
- Before committing, check `git status` and `git diff` for anything that looks like a credential or capture file, even if the filename looks innocuous.
- If the repo has a secret scanner or pre-commit hook for this, run it before pushing; don't bypass it with `--no-verify`.
- If a secret is committed by mistake, don't just delete it in a follow-up commit — it remains in history. Flag it immediately so it can be rotated and purged properly.

## 7. Before opening a PR

Checklist:
- [ ] Branch is rebased on the latest `origin/main` (no merge commits from main into your branch).
- [ ] Lint, typecheck, and test suites pass locally.
- [ ] Full diff reviewed end-to-end for stray changes (formatting noise, leftover comments, unrelated files).
- [ ] No debug output, `console.log`/`print` scaffolding, or commented-out code left behind.
- [ ] Commit messages follow the format in section 1.
- [ ] PR description references the issue and includes test notes.
- [ ] No secrets, `.env` files, or PII in the diff.
