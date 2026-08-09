# Desktop Power-User Features Plan (Electron)

Date: August 8, 2026

Goal: define the feature set the Electron shell needs so that Kanban's heaviest users can live in the desktop app instead of a browser tab — and sequence that work into reviewable slices.

Related docs:

- [Desktop stack 5-way split handoff](../desktop-5-way-split-handoff.md) — how the current shell was landed
- [Cross-platform compatibility remediation plan](./cross-platform-compatibility-remediation-plan.md)

## Compaction resume rule

A session resuming without full context should reread this doc plus `packages/desktop/src/main.ts`, `packages/desktop/src/preload.ts`, and `packages/desktop/src/app-menu.ts` before touching anything.

## Implementation status

Sections 5–6 describe the plan as originally written. This table is the live
record; where the two disagree, this table wins.

| Slice | Status | Notes |
|---|---|---|
| 1. Bridge contract + `useDesktop()` | **Done** | Open question 6 resolved: a `@desktop-bridge` alias, matching the existing `@runtime-*` pattern, rather than a workspace package |
| 2. Auto-update | **Done** | macOS `zip` target added — electron-updater cannot apply an update from a DMG |
| 3. Windows + Linux targets, CI matrix | **Done** | Release workflow added; signing secrets still required (open question 2) |
| 4. Crash/error reporting | **Deferred** | Reordered behind Tier 1: unverifiable here without a DSN, and lower value than presence |
| 5. Native notifications + deep-link routing | **Done** | Routes are `kanban://project/<id>[/task/<id>]` — the project must be in the path, since the web UI addresses tasks as `/<projectId>?task=<id>` |
| 6. Badges + attention signals | **Done** | Windows has no numeric taskbar badge without a rendered overlay per value; it gets the tray summary and attention flash instead |
| 7. Tray + background running | **Partial** | Tray done. Background running / open-at-login not yet built |
| 8. Quit safety | **Done** | Guards on running agents, not pending reviews |
| 9. Action registry + native menu coverage | **Done** | Menu items use `registerAccelerator: false` so the renderer's hotkey handler stays the only binding |
| 10. Command palette | **Done** | `mod+k`, reusing the existing `fzf` dependency |
| 11. Global shortcuts + quick capture | **Partial** | Summon shortcut done — configurable, and an empty accelerator is honoured as a deliberate opt-out. Quick-capture composer not built |
| 12. Window navigation accelerators | **Done** | Cmd/Ctrl+1..9; only the first nine windows get a key, past that the Window menu list is the UI |
| 13. Native pickers | **Done** | Takes precedence over the localhost gate too — a shell against a remote runtime still picks folders locally |
| 14. Context menu + spellcheck | **Done** | Template is a pure function; `spellcheck: true` on every window |
| 15. Drag-and-drop | **Not started** | |
| 16. Recent projects / secure storage / zoom | **Partial** | Zoom persistence done, reapplied on `did-finish-load` since Electron resets zoom per navigation. Recent projects needs the project *path* over the bridge (the renderer holds ids); secure storage still gated on open question 5 |
| 17. Log viewer / endpoint / sleep-wake | **Done** | The log viewer is a shell-owned page with its own preload — it must work when the runtime is down, which is exactly when it is wanted |
| 18. Detached task windows | **Not started** | |

### Found by building, not by planning

Three defects surfaced only from producing real artifacts and launching them,
and none were reachable from typecheck or unit tests:

1. **The packaged app crashed on launch.** `electron-updater` is CommonJS and
   defines `autoUpdater` via `Object.defineProperty`, which cjs-module-lexer
   cannot see, so a named ESM import threw only in a packaged build.
2. The `deb` target failed: fpm needs a maintainer, derived from `author` only
   when that field carries an email.
3. The Linux binary was named `@kanbandesktop` — electron-builder derives it
   from the npm package name, and a scoped name sanitizes badly. It landed in
   the `.desktop` file's `Exec` and `Icon` fields.

The lesson for the remaining slices: build and boot a packaged artifact before
calling a desktop change done.

Separately, the pre-commit hook only typechecked the root package, so type
errors in `web-ui` and `packages/desktop` reached CI. It now checks all three.

---

## 1. Who the desktop power user is

This is not "a browser user who prefers an app icon." Grounded in what Kanban actually does, the power user is someone who:

- runs **5–20 agent tasks concurrently** across **2–5 projects**, each taking minutes to tens of minutes
- keeps the app open for **days**, across sleep/wake cycles
- works **keyboard-first** and expects every action to have a shortcut
- context-switches away while agents work, and needs to be **pulled back** when a task is ready for review or is blocked on input
- reviews diffs, commits, and opens PRs from inside the app

That profile makes the loop **create → agent runs → ready for review → review → ship**, and it means the desktop app's job is to make that loop *observable and controllable while unfocused*. Everything below is prioritized against that.

## 2. Current state — what the shell already does

Verified against the source, not assumed. This is a solid foundation; the plan builds on it rather than reworking it.

| Capability | Where |
|---|---|
| Runtime lifecycle: spawn or attach to the Kanban CLI on `127.0.0.1:3484`, health-probe with a `<title>Kanban</title>` guard, crash detection, recovery probing | `runtime-orchestrator.ts` |
| Child process management, PATH enrichment for GUI launches (Homebrew / nvm / npm-global / Git for Windows) | `runtime-child.ts`, `runtime-child-env.ts` |
| Multi-window with per-window project binding, bounds persistence, off-screen clamping against attached displays, restore-on-launch (capped at 50), last-viewed-path restore | `window-registry.ts`, `window-state.ts`, `window-factory.ts` |
| Renderer-crash and load-failure recovery with a disconnected fallback screen | `window-factory.ts`, `disconnected.html` |
| App menu: File / Edit / View / Window / Help, New Window (`Cmd+Shift+N`), live window list, docs + report-issue links | `app-menu.ts` |
| `kanban://` protocol registration, single-instance lock, argv + `open-url` deep-link intake, OAuth callback relay with a startup queue | `protocol-handler.ts`, `oauth-relay.ts`, `main.ts` |
| Navigation hardening: same-origin `will-navigate` guard, `setWindowOpenHandler` deny + `shell.openExternal` | `window-registry.ts` |
| App Nap / power-save blocking, graceful runtime shutdown on quit | `runtime-orchestrator.ts`, `main.ts` |
| Packaging: electron-builder, macOS DMG (x64 + arm64), hardened runtime, notarization, `asarUnpack` for node-pty | `electron-builder.yml`, `scripts/notarize.cjs` |

## 3. Verified gaps

Each of these was confirmed by grep/read, not inferred.

1. **The `window.desktop` bridge is dead on arrival.** `preload.ts` exposes `platform`, `openProjectWindow`, and `restartRuntime`, but `grep -rn "window.desktop\|DesktopApi\|electron" web-ui/src` returns **zero** hits. There is no global type declaration, no capability detection, and no renderer consumer. Two of the three bridge APIs are unreachable.
2. **No auto-update.** `electron-updater` is not a dependency and `electron-builder.yml` has no `publish:` block. CI typechecks and tests `packages/desktop` (`test.yml`) but never builds an artifact, and `publish.yml` releases only the npm package — so no desktop build is produced or distributed by automation at all. Worse, `web-ui/src/components/update-available-dialog.tsx` tells the user to run an **npm install command** — actively wrong inside a packaged `.app`, where it updates a CLI the desktop bundle doesn't use.
3. **macOS only.** `electron-builder.yml` has a `mac:` block and nothing else. The code already carries Windows support (`kanban.cmd` shim, Windows PATH dirs, PowerShell folder picker) that is never built or tested as a shipped artifact.
4. **The native menu doesn't expose the app's own actions.** Hotkeys exist in the renderer for toggle terminal (`mod+j`), start all tasks (`mod+b`), create task (`c`), git history (`mod+g`), settings (`mod+shift+s`) — see `web-ui/src/hooks/use-app-hotkeys.ts` — but **none** appear in the menu. On desktop the menu bar is the discoverability surface, and on macOS it's the only way users can rebind a shortcut via System Settings.
5. **No background presence at all.** No `Tray`, no `setBadgeCount`, no `setOverlayIcon`, no `flashFrame`, no main-process `Notification` (all zero hits in `packages/desktop/src`). Notifications go through the renderer's web `Notification` API (`use-review-ready-notifications.ts`) behind a browser permission prompt, so the "your agent finished" signal — the single most important event in the product — is the least reliable part of the desktop experience.
6. **Deep links stop at OAuth.** `parseProtocolUrl` only classifies `/oauth/callback`; `main.ts` logs `"no handler is wired for that route"` for everything else. Meanwhile `WindowRegistry.buildWindowUrl` already knows how to route a window to a project, so the missing piece is routing, not plumbing.
7. **No global shortcut** (`globalShortcut`: zero hits). No summon-the-app hotkey, no quick capture.
8. **Native dialogs unused.** `src/server/directory-picker.ts` shells out to `osascript` / `zenity` / `kdialog` / PowerShell. `dialog.showOpenDialog` is available in the shell and correct on all three platforms. `AGENTS.md` already documents zenity/kdialog being unavailable as a known failure mode.
9. **No context menu, no spellcheck.** Electron ships neither by default. Users write task prompts in `task-prompt-composer.tsx` with no right-click menu and no spell checking.
10. **No crash reporting from the shell.** The CLI has `@sentry/node` and the web UI has `@sentry/react`; the Electron main and renderer processes are wired to neither, and `crashReporter` is never called.
11. **Quitting is a footgun.** `before-quit` unconditionally tears down the runtime child. A user with ten agents mid-flight gets no warning, and on Windows/Linux closing the last window quits outright (`window-all-closed`).
12. **Runtime endpoint is hardcoded** to `127.0.0.1:3484` in `main.ts` with no preference and no way to attach to a runtime the user started on another port.
13. **No zoom persistence.** The View menu has zoom roles, but `window-state.ts` doesn't persist `zoomLevel`, so it resets every launch.
14. **No command palette anywhere.** No `cmdk`, no palette component. (`fzf` is *already* a web-ui dependency, so the matcher is free.)
15. **File drag-and-drop from the OS is blocked, not handled.** The `will-navigate` guard rejects non-http(s) navigations, which is correct security-wise but means dropping a file onto a window silently does nothing rather than attaching it to a task.

## 4. Design keystone: the desktop bridge contract

Nearly every renderer-facing feature below depends on the same missing thing, so it gets built first and built properly.

**Problems to solve at once:** the web UI must run **unchanged in a plain browser**, so every desktop capability has to be feature-detected, not assumed; and the shell and web UI ship on independent release cadences, so the bridge needs a version handshake rather than silent breakage.

**Shape:**

```ts
// packages/desktop/src/preload.ts — exposed as window.desktop
interface DesktopApi {
  readonly bridgeVersion: number;       // bumped on breaking change
  readonly platform: NodeJS.Platform;
  readonly appVersion: string;
  readonly capabilities: readonly DesktopCapability[];  // runtime feature detection
  // …namespaced methods: windows.*, notifications.*, dialogs.*, updates.*, shortcuts.*
}
```

**Rules:**

- The type lives in the desktop package and is **published as a shared type**, not hand-copied into `web-ui`. Per `AGENTS.md` ("prefer SDK-provided types over local redefinitions"), the web UI imports the contract rather than re-declaring the shape.
- The renderer accesses it through **one** hook — `useDesktop()` in `web-ui/src/hooks/` — returning `null` in a browser. No component reads `window.desktop` directly.
- Every IPC channel validates its payload in the main process with `zod` (already a root dependency). The renderer origin is guarded by the health-check title match, but a compromised runtime origin should not be able to drive arbitrary main-process behavior.
- Capability checks are per-feature, not per-platform, so a Linux build missing a tray still degrades cleanly.

This unlocks: native pickers, correct update UX, badge counts, palette actions that reach the shell, and deep-link routing.

---

## 5. The feature plan

### Tier 0 — Foundations (blocking; nothing else is reviewable without these)

**0.1 Desktop bridge contract** — as above. Includes `useDesktop()`, `zod`-validated IPC, capability list, version handshake, and a browser-mode no-op path.

**0.2 Auto-update.** Add `electron-updater`, a `publish:` block, and a release workflow alongside `publish.yml`. Signed + notarized on macOS, signed on Windows. Then fix `update-available-dialog.tsx`: when `useDesktop()` is non-null, replace the npm command with **Download → Install on restart**, wired to `autoUpdater`. Users cannot be asked to self-serve updates for a shipped desktop app, and the current dialog gives them advice that doesn't work.

**0.3 Windows and Linux targets.** `win:` (NSIS + portable) and `linux:` (AppImage + deb) blocks, plus CI matrix builds. The platform-specific code already exists and is currently untested as a shipped artifact — every release ships that code path blind.

**0.4 Crash + error reporting for the shell.** `crashReporter` plus `@sentry/electron` for main and renderer, sharing the DSN and release tagging that the CLI and web UI already use. Long-lived multi-day sessions fail in ways that only show up in aggregate.

### Tier 1 — Background presence (highest user-visible value)

This is the tier that makes the desktop app worth installing.

**1.1 Native notifications from the main process.** Move ready-for-review, blocked-on-input, and agent-error signals to Electron's `Notification` via the bridge. No browser permission prompt, works when unfocused, and **click routes to the specific task** (via the deep-link router in 2.3). Keep the existing web path as the browser fallback — `use-review-ready-notifications.ts` becomes transport-agnostic and picks the shell when available.

**1.2 Badge and attention signals.**
- macOS: `app.dock.setBadge()` with the count of tasks awaiting review; `app.dock.bounce("informational")` when a task blocks on input.
- Windows: `win.setOverlayIcon()` + `win.flashFrame(true)`.
- Linux: `app.setBadgeCount()` where the desktop environment supports it; degrade silently.

The counts already exist in board state — this is a subscription from the renderer through the bridge, not new domain logic.

**1.3 Tray / menu-bar item.** Live status (running / ready for review / blocked), a per-project breakdown, quick actions (New Task, Show Kanban, Start All, Quit), and click-to-focus. For a user who has tabbed away for twenty minutes, the tray is the whole product surface.

**1.4 Close-to-tray and background running.** Optional "keep running in the background when the last window closes," making the current macOS-only hide-on-close behavior a cross-platform, user-controlled preference. Pairs with **Open at login** (`app.setLoginItemSettings`).

**1.5 Quit safety.** Before tearing down the runtime, if agent sessions are active, show a native confirm listing what's in flight, with "Quit anyway" / "Keep running in background" / "Cancel". Today `before-quit` kills them silently. This is the one gap in the current shell that can destroy user work.

### Tier 2 — Keyboard-first control

**2.1 Command palette (`Cmd+K`).** Renderer-side, reusing the existing `fzf` dependency for matching and the existing `Dialog` primitive for the shell. Actions: jump to project / task, create task, start all, toggle terminal, open git history, open settings, run a configured shortcut (`use-shortcut-actions.ts` already models these), plus desktop-only entries (new window, open in editor, check for updates) contributed through the bridge. Registry-based so features can register their own actions rather than a central switch.

**2.2 Full native menu coverage.** Every existing hotkey gets a menu item with a matching accelerator, plus the palette. This is discoverability *and* — on macOS — the only route to user rebinding. Menu items dispatch through the bridge into the same action registry as the palette, so there is exactly one definition of "start all tasks."

**2.3 Deep-link routing.** Extend `parseProtocolUrl` beyond OAuth:

| URL | Behavior |
|---|---|
| `kanban://project/<id>` | Focus or open that project's window |
| `kanban://task/<id>` | Focus the window owning that task, open its detail view |
| `kanban://new-task?project=<id>&prompt=<text>` | Open the composer prefilled |

`WindowRegistry.buildWindowUrl` already routes windows to projects, so this is a router plus a focus-or-create policy. Required by notification click-through (1.1) and quick capture (2.4).

**2.4 Global shortcuts.** `globalShortcut` for summon/focus (default `Cmd+Shift+K`) and quick-capture — a small always-on-top composer that creates a task in the last-used project from anywhere in the OS, without switching apps. User-configurable, with graceful handling when registration fails because another app owns the combo.

**2.5 Window navigation.** `Cmd+1..9` to jump to the Nth window, `Cmd+\`` to cycle. The Window menu already enumerates windows; this adds accelerators and ordering.

### Tier 3 — Native integration polish

**3.1 Native file and folder pickers.** Route `add-project-dialog.tsx`, `directory-autocomplete.tsx`, and `remote-file-browser-dialog.tsx` through `dialog.showOpenDialog` when the bridge is present, keeping the server-side picker as the browser/remote path. Directly fixes the documented zenity/kdialog gap for desktop users.

**3.2 Context menu + spellcheck.** A right-click menu (cut/copy/paste/select-all, look-up, spelling suggestions) with `spellcheck: true` on composer surfaces and a terminal-specific menu (copy/paste/clear). Prompt-writing is the app's main text-entry activity and it currently has neither.

**3.3 Drag-and-drop from the OS.** Handle file drops onto the task composer and image strip — the image plumbing already exists in `task-image-input-utils.ts` / `task-image-strip.tsx`. Must be implemented as an explicit drop handler that keeps the `will-navigate` guard intact rather than relaxing it.

**3.4 Recent projects.** `app.addRecentDocument` (macOS Dock menu / Windows Jump List) so reopening a project doesn't require the app to be running.

**3.5 Secure token storage.** Move agent/provider credentials to `safeStorage` (Keychain / DPAPI / libsecret) when running under the shell, instead of plaintext config on disk.

**3.6 Zoom persistence.** Persist `zoomLevel` per window in `window-state.ts` alongside bounds.

### Tier 4 — Long-session reliability

**4.1 Runtime log viewer.** A "Show Runtime Logs" window streaming the runtime child's stdout/stderr. Today that output goes to a console nobody can see in a packaged app, which makes every user-reported startup failure unreproducible.

**4.2 Configurable runtime endpoint.** A preference for host/port plus explicit "attach to an existing runtime," replacing the hardcoded `DEFAULT_PORT = 3484`. Power users run the CLI themselves; today the app can't be pointed at it.

**4.3 Sleep/wake resilience.** Hook `powerMonitor` `suspend`/`resume` to force a health re-probe and reconnect on wake, rather than waiting for the next interval tick to notice a dead runtime.

**4.4 Detached task windows.** Pop a task detail view into its own window — review a diff on one monitor while agents keep running on another. Depends on the deep-link routing from 2.3.

---

## 6. Sequencing and PR slices

Ordered so each slice is independently reviewable and shippable, matching the slicing discipline used for the original desktop stack.

| # | Slice | Depends on | Notes |
|---|---|---|---|
| 1 | Bridge contract + `useDesktop()` + zod-validated IPC | — | No user-visible change; unblocks everything |
| 2 | Auto-update (updater, publish config, release workflow) + desktop update UX | 1 | Ship before growing the surface area — otherwise every later fix is stranded on users' disks |
| 3 | Windows + Linux targets, CI matrix | 2 | Reuses the release workflow from slice 2 |
| 4 | Crash/error reporting | 1 | Small; land early so Tier 1 rollout is observable |
| 5 | Native notifications + deep-link routing | 1 | Routing ships with notifications because click-through needs it |
| 6 | Badges + attention signals | 5 | |
| 7 | Tray + background running + open-at-login | 6 | |
| 8 | Quit safety | 7 | Depends on the background-running choice being available |
| 9 | Action registry + native menu coverage | 1 | Registry first, so the palette and menu share one definition |
| 10 | Command palette | 9 | |
| 11 | Global shortcuts + quick capture | 9, 5 | |
| 12 | Window navigation accelerators | 9 | |
| 13 | Native pickers | 1 | Independent of Tier 1/2 — parallelizable |
| 14 | Context menu + spellcheck | 1 | Independent — parallelizable |
| 15 | Drag-and-drop | 1 | |
| 16 | Recent projects, secure storage, zoom persistence | 1 | Small, batchable |
| 17 | Log viewer, configurable endpoint, sleep/wake | 1 | |
| 18 | Detached task windows | 5 | Largest Tier 4 item; do last |

Slices 13–17 have no dependency on Tiers 1–2 beyond the bridge, so they can run in parallel with the presence work.

## 7. Cross-cutting constraints

- **Browser parity is non-negotiable.** Every feature is additive behind capability detection. The web UI must keep working with no shell present, and CI should cover both modes.
- **Don't fork the domain logic.** Notifications, badge counts, and palette actions all read state the renderer already owns. The shell is a *transport and presentation* layer; new business logic in `packages/desktop` is a design smell.
- **One definition per action.** The action registry (slice 9) is what keeps hotkey, menu item, palette entry, tray item, and deep link from drifting into five implementations of "start all tasks."
- **Preserve the security posture.** The same-origin `will-navigate` guard, `setWindowOpenHandler` deny-by-default, `sandbox: true`, `contextIsolation: true`, and the `<title>Kanban</title>` health-check guard all stay. New IPC widens the attack surface, so every channel gets schema validation and the drag-and-drop work must not relax navigation rules.
- **Test at the right level.** `packages/desktop/test/` covers main-process modules with plain vitest and no Electron runtime; keep that. Tray, notification, and menu logic should be extracted into pure, testable modules the way `window-state.ts` and `protocol-handler.ts` already are, with Electron API calls at the edges.

## 8. Open questions

These need a decision before the affected slices start; none block slice 1.

1. **Update channel policy** — stable only, or a beta/nightly channel? Affects the `publish` config and whether the settings UI needs a channel selector. (Slice 2)
2. **Windows code-signing certificate** — is one available? Without it, SmartScreen will flag every install, which changes whether slice 3 is shippable or preview-only.
3. **Tray as primary or secondary surface** — a full status popover (rich, more work) versus a menu with counts (cheap, ships now). Recommendation: menu with counts first, evaluate a popover after usage data. (Slice 7)
4. **Default background-running behavior** — opt-in or opt-out? Opt-out matches the mental model that agents keep working, but "closed it and it's still running" surprises people. Recommendation: opt-in, promoted once by a one-time prompt on first close-with-agents-running. (Slice 7)
5. **Secure storage migration** — do existing plaintext credentials get migrated on first launch, or is `safeStorage` new-credentials-only? Migration is friendlier but needs a rollback story if the keychain is unavailable. (Slice 16)
6. **Bridge type distribution** — publish the contract from `packages/desktop` as a real workspace package, or keep it as a `.d.ts` the web UI references by path? A package is cleaner but is the repo's first workspace-dependency edge. (Slice 1)
