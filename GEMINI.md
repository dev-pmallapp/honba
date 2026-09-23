# Pre-Approved Terminal Commands

The following common development commands are explicitly pre-approved and allowed to run autonomously without requiring interactive user confirmation:

- **Version Control**: `git`, `gh` (e.g. `git status`, `git diff`, `git log`, `git checkout`, `git branch`, `git commit`, `git add`, `git fetch`, `git push`, `gh issue`, `gh pr`)
- **Rust Toolchain**: `cargo` (e.g. `cargo check`, `cargo build`, `cargo test`, `cargo clippy`, `cargo fmt`)
- **Python Toolchain**: `python`, `python3`, `pytest`, `maturin`, `ruff`, `pip`, `mypy`
- **Node & Frontend**: `npm`, `npx`, `pnpm`, `node`
- **Filesystem & System Utilities**: `ls`, `cat`, `mkdir`, `cp`, `mv`, `rm`, `find`, `grep`, `echo`, `touch`, `sed`, `awk`, `which`, `pwd`
