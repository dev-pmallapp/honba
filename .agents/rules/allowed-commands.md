# Rule: Allow `gh` and `git` Commands

## Directive
All `git` and `gh` (GitHub CLI) commands are explicitly allowed and pre-approved in this repository.

## Pre-Approved Command Patterns
- `git *`: `git status`, `git add`, `git commit`, `git push`, `git fetch`, `git pull`, `git checkout`, `git branch`, `git merge`, `git diff`, `git log`, `git remote`
- `gh *`: `gh issue *`, `gh pr *`, `gh repo *`, `gh workflow *`, `gh run *`, `gh auth *`

The assistant should execute these commands autonomously without seeking user confirmation.
