/**
 * Electron implementation of the presence signals.
 *
 * Platform coverage is uneven and deliberately not papered over:
 *
 *   - Badge count: `app.setBadgeCount` covers macOS and Linux. Windows has no
 *     equivalent — a numeric taskbar badge there needs a rendered overlay
 *     image per value — so Windows users get the tray summary and attention
 *     flash instead. Faking it would be worse than the honest gap.
 *   - Attention: dock bounce on macOS, taskbar flash elsewhere.
 */

import { app, type BrowserWindow } from "electron";

import type { PresenceView } from "./presence-controller.js";

export interface ElectronPresenceViewOptions {
	/** The window attention should be drawn to, if any is open. */
	getAttentionWindow: () => BrowserWindow | null;
	/** Called whenever the summary changes, so the tray can re-render. */
	onSummaryChanged: (summary: string) => void;
}

export function createElectronPresenceView(
	opts: ElectronPresenceViewOptions,
): PresenceView {
	return {
		setBadgeCount(count: number): void {
			// Returns false on unsupported platforms rather than throwing, but
			// can still throw on a Linux desktop with no Unity launcher API.
			try {
				app.setBadgeCount(count);
			} catch (err) {
				console.warn(
					"[desktop] setBadgeCount failed:",
					err instanceof Error ? err.message : err,
				);
			}
		},

		requestAttention(): void {
			try {
				if (process.platform === "darwin") {
					// "informational" bounces once instead of until focused —
					// a task ready for review is worth a nudge, not a tantrum.
					app.dock?.bounce("informational");
					return;
				}
				const window = opts.getAttentionWindow();
				if (window && !window.isDestroyed() && !window.isFocused()) {
					window.flashFrame(true);
				}
			} catch (err) {
				console.warn(
					"[desktop] requestAttention failed:",
					err instanceof Error ? err.message : err,
				);
			}
		},

		setSummary(summary: string): void {
			opts.onSummaryChanged(summary);
		},
	};
}
