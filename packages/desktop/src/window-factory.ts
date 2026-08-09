import { dialog, type BrowserWindow } from "electron";

import type { DesktopBridgeBootstrap } from "./bridge/contract.js";
import type { DeepLinkTarget } from "./protocol-handler.js";
import { WindowRegistry } from "./window-registry.js";
import {
	type PersistedWindowState,
	isPersistableRuntimePath,
} from "./window-state.js";

export interface RuntimeOrchestratorLike {
	getUrl(): string | null;
	defaultOrigin(): string;
	checkHealth(origin: string): Promise<boolean>;
}

// Electron emits -3 (ERR_ABORTED) on navigations superseded by another load —
// those are expected flow events, not real failures.
const ERR_ABORTED = -3;

export interface WindowFactoryOptions {
	preloadPath: string;
	bridgeBootstrap: DesktopBridgeBootstrap;
	isPackaged: boolean;
	backgroundColor: string;
	disconnectedHtmlPath: string;
	registry: WindowRegistry;
	orchestrator: RuntimeOrchestratorLike;
	isQuitting: () => boolean;
	onMenuDirty: () => void;
}

export interface CreateWindowOptions {
	projectId?: string | null;
	initialPath?: string | null;
	savedState?: PersistedWindowState;
}

export class WindowFactory {
	constructor(private readonly opts: WindowFactoryOptions) {}

	create(options: CreateWindowOptions = {}): BrowserWindow {
		const window = this.opts.registry.createWindow({
			projectId: options.projectId ?? null,
			savedState: options.savedState,
			preloadPath: this.opts.preloadPath,
			bridgeBootstrap: this.opts.bridgeBootstrap,
			isPackaged: this.opts.isPackaged,
			backgroundColor: this.opts.backgroundColor,
			hideOnCloseForMac: true,
			isQuitting: this.opts.isQuitting,
			onWindowClosed: this.opts.onMenuDirty,
			onWindowFocused: this.opts.onMenuDirty,
		});

		this.attachRendererRecovery(window);

		const runtimeUrl = this.opts.orchestrator.getUrl();
		if (runtimeUrl) {
			const url = buildWindowUrl(runtimeUrl, options);
			window.loadURL(url).catch((err: unknown) => {
				console.error(
					"[desktop] Failed to load URL in window:",
					err instanceof Error ? err.message : err,
				);
			});
		}

		this.opts.onMenuDirty();
		return window;
	}

	/**
	 * Surface a deep-link target: focus the window already bound to that
	 * project and navigate it, or open a new one.
	 *
	 * Reusing the existing window is the point. Opening a fresh window per
	 * link would leave a user who clicks several notifications with a pile of
	 * duplicates for the same project.
	 */
	revealTarget(target: DeepLinkTarget): void {
		const runtimeUrl = this.opts.orchestrator.getUrl();
		if (!runtimeUrl) {
			// Nothing is navigable before the runtime is up. Dropping the link
			// is correct — `main.ts` queues links that arrive during startup.
			console.warn(
				"[desktop] Ignoring deep link while the runtime is unavailable.",
			);
			return;
		}

		const url = new URL(runtimeUrl);
		url.pathname = target.pathname;
		url.search = target.search;
		const href = url.toString();

		const existing = this.opts.registry.findByProjectId(target.projectId);
		if (!existing) {
			this.create({ projectId: target.projectId, initialPath: null });
			// `create` loads the project's base URL; follow up with the exact
			// target so a task link lands on the task rather than the board.
			const created = this.opts.registry.findByProjectId(target.projectId);
			if (created) this.navigateAndFocus(created.window, href);
			return;
		}

		this.navigateAndFocus(existing.window, href);
	}

	private navigateAndFocus(window: BrowserWindow, href: string): void {
		if (window.isDestroyed()) return;
		window.loadURL(href).catch((err: unknown) => {
			console.warn(
				"[desktop] Deep-link navigation failed:",
				err instanceof Error ? err.message : err,
			);
		});
		if (window.isMinimized()) window.restore();
		window.show();
		window.focus();
	}

	showDisconnectedScreen(): void {
		// Iterate the registry rather than `BrowserWindow.getAllWindows()` so
		// we only flip windows we own — matches every other broadcast site
		// (loadUrlInAllWindows, saveAllStates).
		for (const win of this.opts.registry.getAllLive()) {
			win.loadFile(this.opts.disconnectedHtmlPath).catch((err: unknown) => {
				// If this fails the window is left blank with no diagnostic.
				// Surface it so packaging/path mistakes are visible in the log.
				console.warn(
					"[desktop] Failed to load disconnected screen from",
					this.opts.disconnectedHtmlPath,
					"—",
					err instanceof Error ? err.message : err,
				);
			});
		}
		this.opts.onMenuDirty();
	}

	private attachRendererRecovery(window: BrowserWindow): void {
		// Probe the runtime on renderer failures so we can distinguish a transient
		// renderer glitch (retry) from an unreachable runtime (disconnected screen).
		window.webContents.on(
			"did-fail-load",
			(_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
				if (errorCode === ERR_ABORTED || !isMainFrame) return;
				console.error(
					`[desktop] Renderer load failed: ${errorDescription} (code ${errorCode})`,
				);

				const origin =
					this.opts.orchestrator.getUrl() ??
					this.opts.orchestrator.defaultOrigin();
				void this.opts.orchestrator.checkHealth(origin).then((healthy) => {
					if (window.isDestroyed()) return;

					if (!healthy) {
						this.showDisconnectedScreen();
						return;
					}

					const choice = dialog.showMessageBoxSync(window, {
						type: "error",
						title: "Page Load Failed",
						message: `The app failed to load:\n\n${errorDescription}`,
						buttons: ["Retry", "Dismiss"],
						defaultId: 0,
					});
					if (choice === 0) {
						window.loadURL(validatedURL).catch((err: unknown) => {
							console.warn(
								"[desktop] Retry loadURL failed:",
								err instanceof Error ? err.message : err,
							);
						});
					}
				});
			},
		);

		window.webContents.on("render-process-gone", (_event, details) => {
			console.error(`[desktop] Renderer process gone: reason=${details.reason}`);
			if (window.isDestroyed()) return;

			// Capture the URL the renderer was on *synchronously*, before the
			// async health probe. Without this, recovery loads the bare runtime
			// URL and silently drops whichever project/path the user was on.
			// `did-fail-load` already preserves the URL (it's passed in as
			// `validatedURL`); this brings the crash path to parity.
			const lastUrl = window.webContents.getURL();

			const origin =
				this.opts.orchestrator.getUrl() ??
				this.opts.orchestrator.defaultOrigin();
			void this.opts.orchestrator.checkHealth(origin).then((healthy) => {
				if (window.isDestroyed()) return;
				const runtimeUrl = this.opts.orchestrator.getUrl();
				if (healthy && runtimeUrl) {
					const target = pickRecoveryUrl(lastUrl, runtimeUrl);
					window.loadURL(target).catch((err: unknown) => {
						console.warn(
							"[desktop] Renderer-recovery loadURL failed:",
							err instanceof Error ? err.message : err,
						);
					});
				} else {
					this.showDisconnectedScreen();
				}
			});
		});
	}
}

/**
 * Choose the URL to reload after a renderer crash, preferring the route the
 * renderer was on so the user lands back in the same place. Falls back to the
 * bare runtime URL if `lastUrl` is missing, unparseable, not http(s), or on a
 * different origin than the current runtime (e.g. the runtime restarted on a
 * new port, or the renderer was already on a `file://` disconnected screen).
 *
 * Exported only for tests — internal helper.
 */
export function pickRecoveryUrl(lastUrl: string, runtimeUrl: string): string {
	if (!lastUrl) return runtimeUrl;
	let last: URL;
	let rt: URL;
	try {
		last = new URL(lastUrl);
		rt = new URL(runtimeUrl);
	} catch {
		return runtimeUrl;
	}
	if (last.protocol !== "http:" && last.protocol !== "https:") {
		return runtimeUrl;
	}
	if (last.origin !== rt.origin) return runtimeUrl;
	return lastUrl;
}

/**
 * Reject protocol-relative and scheme-prefixed paths that could escape the
 * runtime origin when combined with `new URL(base)`.
 */
function isSafeInitialPath(p: string): boolean {
	if (!p.startsWith("/")) return false;
	if (p.startsWith("//")) return false;
	if (/^\/[a-z][a-z0-9+\-.]*:/i.test(p)) return false;
	return true;
}

function buildWindowUrl(
	runtimeUrl: string,
	options: CreateWindowOptions,
): string {
	if (options.projectId) {
		return WindowRegistry.buildWindowUrl(runtimeUrl, options.projectId);
	}
	if (options.initialPath) {
		if (
			!isSafeInitialPath(options.initialPath) ||
			!isPersistableRuntimePath(options.initialPath)
		) {
			console.warn(
				`[desktop] Ignoring unsafe initialPath: ${options.initialPath}`,
			);
			return runtimeUrl;
		}
		const parsed = new URL(runtimeUrl);
		parsed.pathname = options.initialPath;
		return parsed.toString();
	}
	return runtimeUrl;
}
