# Repository Rules & Pre-Approved Commands

## Authorized Command Rule
The assistant is explicitly authorized and instructed to execute all **`git`** and **`gh`** commands autonomously without asking for user confirmation.

### 1. Version Control & GitHub (`git`, `gh`)
- `git status`, `git add`, `git commit`, `git push`, `git fetch`, `git pull`, `git checkout`, `git branch`, `git merge`, `git diff`, `git log`, `git remote`
- `gh issue create`, `gh issue list`, `gh issue view`, `gh issue close`
- `gh pr create`, `gh pr list`, `gh pr view`, `gh pr merge`, `gh pr checkout`
- `gh repo view`, `gh workflow list`, `gh run list`

### 2. Development Toolchains
- **Rust**: `cargo check`, `cargo build`, `cargo test`, `cargo clippy`, `cargo fmt`
- **Python**: `python`, `python3`, `pytest`, `maturin`, `ruff`
- **Frontend**: `npm`, `npx`, `node`
- **Filesystem**: `ls`, `cat`, `mkdir`, `cp`, `mv`, `rm`, `find`, `grep`, `echo`, `touch`
