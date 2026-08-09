/**
 * The "Runtime Logs" window.
 *
 * Deliberately independent of the app's own window stack and bridge: its
 * whole reason to exist is diagnosing a runtime that will not start, so it
 * must not depend on the runtime serving anything. The page is a local file
 * and gets its own narrow preload.
 */

import { BrowserWindow, clipboard } from "electron";

import type { RuntimeLogBuffer, RuntimeLogLine } from "./runtime-log-buffer.js";

export const LOG_CHANNEL = {
	GetLines: "runtime-logs:get-lines",
	Clear: "runtime-logs:clear",
	CopyAll: "runtime-logs:copy-all",
	/** Main → renderer push. */
	Line: "runtime-logs:line",
} as const;

export interface IpcMainLike {
	on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
	handle(
		channel: string,
		listener: (event: unknown, ...args: unknown[]) => unknown,
	): unknown;
}

export interface LogWindowOptions {
	htmlPath: string;
	preloadPath: string;
	logs: RuntimeLogBuffer;
}

/** Formats captured lines for the clipboard, marking which stream each came from. */
export function formatLogsForClipboard(lines: readonly RuntimeLogLine[]): string {
	return lines
		.map((line) => (line.stream === "stderr" ? `[stderr] ${line.text}` : line.text))
		.join("\n");
}

export class LogWindow {
	private window: BrowserWindow | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(private readonly opts: LogWindowOptions) {}

	/** Registers the IPC this window's page uses. Call once at startup. */
	registerIpc(ipc: IpcMainLike): void {
		ipc.handle(LOG_CHANNEL.GetLines, () => this.opts.logs.getLines());
		ipc.on(LOG_CHANNEL.Clear, () => this.opts.logs.clear());
		ipc.on(LOG_CHANNEL.CopyAll, () => {
			clipboard.writeText(formatLogsForClipboard(this.opts.logs.getLines()));
		});
	}

	/** Open the window, or focus it if already open. */
	show(): void {
		if (this.window && !this.window.isDestroyed()) {
			if (this.window.isMinimized()) this.window.restore();
			this.window.focus();
			return;
		}

		const window = new BrowserWindow({
			width: 900,
			height: 600,
			title: "Runtime Logs",
			backgroundColor: "#1F2428",
			show: false,
			webPreferences: {
				preload: this.opts.preloadPath,
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true,
			},
		});
		this.window = window;

		window.once("ready-to-show", () => window.show());

		// Streaming beats polling here: a startup failure produces its output
		// in a burst, and a poll interval would either miss it or arrive after
		// the user has given up.
		this.unsubscribe = this.opts.logs.subscribe((line) => {
			if (window.isDestroyed()) return;
			window.webContents.send(LOG_CHANNEL.Line, line);
		});

		window.on("closed", () => {
			this.unsubscribe?.();
			this.unsubscribe = null;
			this.window = null;
		});

		window.loadFile(this.opts.htmlPath).catch((err: unknown) => {
			console.warn(
				"[desktop] Failed to load the runtime log window:",
				err instanceof Error ? err.message : err,
			);
		});
	}

	close(): void {
		this.window?.destroy();
		this.window = null;
		this.unsubscribe?.();
		this.unsubscribe = null;
	}
}
