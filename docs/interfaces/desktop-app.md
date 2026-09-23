# Desktop Application: Tauri 2.0 & Native Security

## 1. Tauri 2.0 Native Bundle

Honba packages as a native desktop application using **Tauri 2.0**:
- **Tiny Resource Footprint**: Under 40MB RAM usage compared to Electron's 500MB+ overhead.
- **Embedded Database**: Local SQLite database for strategy run history, trade logs, and cached historical data.
- **Offline Capability**: Run full backtests and anti-overfitting audits locally without internet connection.

---

## 2. OS-Level Keyring Security (`keyring-rs`)

Dhan HQ API credentials (Client ID, Access Token, PIN) are encrypted inside the operating system's native hardware security enclave:
- **macOS**: Apple Keychain Services.
- **Windows**: Windows Credential Manager.
- **Linux**: FreeDesktop Secret Service API.

**Zero plain-text API secrets are stored on disk.**
