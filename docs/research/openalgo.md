# OpenAlgo & OpenAlgo Desktop: Indian Market Integration & Security

## 1. Overview & Purpose

**OpenAlgo** ([openalgo.in](https://openalgo.in) / [github.com/marketcalls/openalgo-desktop](https://github.com/marketcalls/openalgo-desktop)) is an open-source algorithmic trading platform created by Marketcalls specifically for Indian traders.

Its primary mission is to serve as a **unified gateway** that standardizes broker interactions across 33+ Indian brokers (Zerodha, Angel One, Fyers, Upstox, Dhan, Finvasia, etc.), allowing strategy creators to write execution logic once and route to any broker seamlessly.

---

## 2. OpenAlgo Desktop Architecture (Tauri 2.0 + Rust)

While the original OpenAlgo was a self-hosted Python/Flask web app, Marketcalls introduced **OpenAlgo Desktop** built with **Tauri 2.0 and Rust**, introducing critical architectural enhancements:

```
+-----------------------------------------------------------------------------------+
|                            OPENALGO DESKTOP ARCHITECTURE                          |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   |                       React UI Layer (Frontend Webview)                   |   |
|   |         - Zero server setup; runs as native desktop GUI                   |   |
|   |         - Integrated order status, broker authentication, Greeks monitor  |   |
|   +-------------------------------------+-------------------------------------+   |
|                                         |  (IPC / Tauri Commands)                 |
|                                         v                                         |
|   +---------------------------------------------------------------------------+   |
|   |                            Rust Backend (Tauri 2.0)                       |   |
|   |                                                                           |   |
|   |  +--------------------+  +---------------------+  +--------------------+  |   |
|   |  | OS Keyring Vault   |  | Embedded SQLite DB  |  | Broker Routing     |  |   |
|   |  | (Hardware Keychain)|  | (Local Trade Logs)  |  | (33+ Indian APIs)  |  |   |
|   |  +--------------------+  +---------------------+  +--------------------+  |   |
|   |  +---------------------------------------------------------------------+  |   |
|   |  | Indian Compliance Manager (03:00 AM IST Auto-Session Expire)        |  |   |
|   |  +---------------------------------------------------------------------+  |   |
|   +---------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 3. Unique Superpowers of OpenAlgo Desktop

### 3.1 OS-Level Secure Keyring Storage
Rather than storing sensitive broker API keys, API secrets, and login PINs in plaintext `.env` or JSON files, OpenAlgo Desktop utilizes native OS keyrings:
- **macOS**: Apple Keychain Services.
- **Windows**: Windows Credential Manager.
- **Linux**: FreeDesktop Secret Service API.

This ensures zero plain-text leaks of credentials, even if repository files are shared.

### 3.2 Indian Regulatory Compliance
- **03:00 AM Session Reset**: Indian stockbrokers invalidate API sessions daily around 03:00-04:00 AM IST as mandated by SEBI. OpenAlgo Desktop automatically enforces daily re-authentication flows.
- **Indian Taxation Breakdown**: Computes STT, GST, Exchange charges, and Stamp Duty.

### 3.3 Derivatives & Options Analytics
- Real-time Black-Scholes Option Greeks calculation (Delta, Gamma, Theta, Vega).
- Open Interest (OI) tracking, Put-Call Ratio (PCR), and multi-leg order execution.

---

## 4. Key Takeaways for Honba

1. **Adopt Tauri 2.0 + Rust**: Package Honba as a lightweight desktop app alongside the Web UI and CLI.
2. **Secure Keyring**: Use `keyring-rs` to encrypt Dhan HQ credentials in the user's OS hardware enclave.
3. **Session Compliance**: Implement automatic session refresh and 03:00 AM reset handling.
4. **Options Engine**: Native options analytics (Greeks, strike ladder, OI build-up).
