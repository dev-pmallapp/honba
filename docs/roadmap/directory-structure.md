# Codebase Directory Structure

```
honba/
├── Cargo.toml                          # Rust workspace manifest
├── pyproject.toml                      # Python package configuration (Maturin)
├── docs/                               # Hierarchical documentation tree
│   ├── README.md                       # Master documentation index
│   ├── research/                       # Research on landmark frameworks
│   │   ├── jesse-ai.md
│   │   ├── barter-rs.md
│   │   ├── openalgo.md
│   │   ├── tickgrinder.md
│   │   └── comparative-analysis.md
│   ├── market/                         # Indian market specifics
│   │   ├── microstructure.md
│   │   ├── instruments.md
│   │   ├── taxation-and-fees.md
│   │   └── dhan-api.md
│   ├── architecture/                   # Core system architecture
│   │   ├── system-design.md
│   │   ├── rust-core.md
│   │   ├── python-layer.md
│   │   ├── execution-pipeline.md
│   │   └── actor-model.md
│   ├── methodology/                    # Statistical & anti-overfitting methods
│   │   ├── anti-overfitting.md
│   │   ├── cross-validation.md
│   │   └── stress-testing.md
│   ├── interfaces/                     # UI, CLI, Desktop & AI Agent
│   │   ├── web-ui.md
│   │   ├── desktop-app.md
│   │   ├── terminal-cli.md
│   │   └── ai-agent-mcp.md
│   └── roadmap/                        # Phasing & codebase layout
│       ├── project-milestones.md
│       └── directory-structure.md
├── crates/                             # High-performance Rust crates
│   ├── honba-core/                     # Events, orders, tax engine, execution
│   ├── honba-indicators/               # SIMD indicators & Black-Scholes Greeks
│   ├── honba-overfit/                  # CPCV, DSR, PBO, Monte Carlo engines
│   ├── honba-dhan/                     # Dhan HQ REST & WebSocket binary client
│   └── honba-pyo3/                     # PyO3 FFI bridge exposing engine to Python
├── python/                             # Python strategy & research package
│   ├── honba/
│   │   ├── strategy/                   # Strategy base class & lifecycle hooks
│   │   ├── research/                   # Jupyter notebooks & tearsheets
│   │   ├── mcp/                        # Model Context Protocol server
│   │   ├── cli/                        # Interactive CLI (Typer + Rich)
│   │   └── server/                     # FastAPI / WebSockets backend
├── web/                                # Web UI (React + Tailwind + Lightweight Charts)
└── src-tauri/                          # Tauri 2.0 desktop shell & OS keyring
```
