# Sable

> A fast, minimal, privacy-first browser.

Sable is a lightweight desktop browser built on Electron + Chromium. The engine
choice is deliberate: the headline feature is a **built-in ad/tracker blocker**,
which needs low-level request interception (`session.webRequest`) and real
multi-process tabs — both first-class in Chromium and identical across macOS and
Windows. We earn our "low RAM" story through **tab suspension** and zero bloat,
not a thin shell.

## Monorepo layout

```
sable/
├── apps/
│   ├── desktop/          # Electron browser (Phase 1) — this is what runs today
│   │   ├── electron/
│   │   │   ├── main/     # Node main process
│   │   │   │   ├── tabs/     # WebContentsView manager (+ suspension, M4)
│   │   │   │   ├── ipc/      # typed IPC handlers
│   │   │   │   ├── adblock/  # request interception + stats (M2)
│   │   │   │   ├── storage/  # SQLite: history/bookmarks/downloads (M3)
│   │   │   │   ├── auth/     # Google OAuth loopback + keychain (M5)
│   │   │   │   └── sync/     # sync client (Phase 2)
│   │   │   └── preload/  # contextBridge -> window.sable
│   │   └── src/          # React + Tailwind chrome UI
│   ├── backend/          # Rust/Axum sync server (Phase 2)
│   ├── web/              # companion dashboard (future)
│   └── mobile/           # native/RN client (future)
└── packages/
    └── shared/           # TS contracts shared by desktop, backend, mobile
```

Web content lives in Chromium `WebContentsView`s (one process each, sandboxed).
The React layer draws only the "chrome" (tab strip, omnibox) and talks to the
main process over a typed IPC bridge — it never touches page content directly.

## Architecture rules

- **One source of truth for tabs**: the main process. The renderer is a pure
  projection that reflects `TabState` snapshots and sends intents back.
- **`packages/shared` is the contract layer.** IPC channel names, settings, and
  the Phase 2 sync DTOs live here so desktop, the Rust backend, and mobile can
  never drift.
- **Security defaults on**: `sandbox`, `contextIsolation`, no `nodeIntegration`
  in web content. Private tabs use an ephemeral in-memory session partition.

## Features (Phase 1 — done)

- **Built-in ad & tracker blocking** — EasyList + EasyPrivacy on every tab, with a
  live dashboard (requests blocked, data saved, blocked-over-time heatmap) and a
  per-site allow-list. No extensions.
- **Tab suspension** — background tabs are discarded after 10 minutes idle and
  restored instantly on focus. Real renderer processes freed, real RAM back.
- **Split view** (`⌘\`) — two pages side by side in one window.
- **Focus mode** (`⌘⇧F`) — all chrome hidden, pure full-window web.
- **Command palette** (`⌘K`) — commands + history search + go-to-URL.
- **Right-click menus** — link/image/selection actions, Inspect Element.
- **Local-first storage** — history, bookmarks, downloads, settings in SQLite on
  device. Private tabs use an ephemeral in-memory session. No telemetry.
- **Themes** — system/light/dark, driven through `nativeTheme` so internal pages
  and sites follow along.

## Roadmap

| Milestone | Scope | Status |
|-----------|-------|--------|
| M1 | Tabs, navigation, omnibox | ✅ |
| M2 | Ad blocker + stats dashboard + whitelist | ✅ |
| M3 | SQLite: history, bookmarks, downloads, heatmap | ✅ |
| M4 | Tab suspension, command palette, shortcuts | ✅ |
| M5a | Settings UI (theme, search engine, privacy, profile) | ✅ |
| M5b | Google OAuth (loopback + PKCE, OS keychain) | ⏳ needs domain legal pages |
| Phase 2 | Rust/Axum backend + Postgres, delta sync; then mobile + web | 🔜 |

The landing site (with the privacy/terms pages Google OAuth requires) lives in
[`apps/web`](apps/web) and deploys to GitHub Pages via Actions on every push.

## Develop

```bash
pnpm install
pnpm dev        # launches the Electron app with HMR
pnpm typecheck  # type-check the desktop app
pnpm build      # production build
```

Requires Node ≥ 20 and pnpm ≥ 9.
