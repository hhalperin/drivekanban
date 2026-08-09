/**
 * Menu-bar / system-tray presence.
 *
 * For a user who has tabbed away for twenty minutes, the tray *is* the
 * product surface: it answers "is anything waiting on me?" without switching
 * apps, and gives one click back into the board.
 */

import { Menu, Tray, nativeImage } from "electron";

export interface AppTrayOptions {
	/** Path to the tray icon image. */
	iconPath: string;
	onShowKanban: () => void;
	onQuit: () => void;
}

export class AppTray {
	private tray: Tray | null = null;
	private summary = "No active tasks";

	constructor(private readonly opts: AppTrayOptions) {}

	/**
	 * Create the tray icon.
	 *
	 * Failure is non-fatal and common: headless Linux sessions and desktops
	 * without a StatusNotifier host have no tray at all. The app must still
	 * run, just without this surface.
	 */
	start(): boolean {
		if (this.tray) return true;
		try {
			const image = nativeImage.createFromPath(this.opts.iconPath);
			if (image.isEmpty()) {
				console.warn(
					`[desktop] Tray icon missing or unreadable at ${this.opts.iconPath} — skipping tray.`,
				);
				return false;
			}
			// The macOS menu bar wants a small template image; anything larger
			// renders as an oversized blob next to the system icons.
			const trayImage =
				process.platform === "darwin"
					? image.resize({ width: 16, height: 16 })
					: image.resize({ width: 24, height: 24 });
			if (process.platform === "darwin") {
				trayImage.setTemplateImage(true);
			}

			this.tray = new Tray(trayImage);
			this.tray.on("click", () => this.opts.onShowKanban());
			this.render();
			return true;
		} catch (err) {
			console.warn(
				"[desktop] Tray unavailable:",
				err instanceof Error ? err.message : err,
			);
			return false;
		}
	}

	setSummary(summary: string): void {
		if (this.summary === summary) return;
		this.summary = summary;
		this.render();
	}

	destroy(): void {
		this.tray?.destroy();
		this.tray = null;
	}

	private render(): void {
		if (!this.tray || this.tray.isDestroyed()) return;
		this.tray.setToolTip(`Kanban — ${this.summary}`);
		this.tray.setContextMenu(
			Menu.buildFromTemplate([
				// A disabled first item is the conventional way to show status
				// in a tray menu; it reads as a heading rather than an action.
				{ label: this.summary, enabled: false },
				{ type: "separator" },
				{ label: "Show Kanban", click: () => this.opts.onShowKanban() },
				{ type: "separator" },
				{ label: "Quit Kanban", click: () => this.opts.onQuit() },
			]),
		);
	}
}
