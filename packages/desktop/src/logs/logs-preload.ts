/**
 * Preload for the Runtime Logs window only.
 *
 * Kept separate from the app's `preload.ts` on purpose: this page is a
 * diagnostic surface that must work when the runtime is down, and it has no
 * business seeing — or being able to drive — the app bridge.
 */

import { contextBridge, ipcRenderer } from "electron";

import { LOG_CHANNEL } from "./log-window.js";
import type { RuntimeLogLine } from "./runtime-log-buffer.js";

contextBridge.exposeInMainWorld("runtimeLogs", {
	getLines(): Promise<RuntimeLogLine[]> {
		return ipcRenderer.invoke(LOG_CHANNEL.GetLines) as Promise<RuntimeLogLine[]>;
	},

	clear(): void {
		ipcRenderer.send(LOG_CHANNEL.Clear);
	},

	copyAll(): void {
		ipcRenderer.send(LOG_CHANNEL.CopyAll);
	},

	onLine(listener: (line: RuntimeLogLine) => void): void {
		ipcRenderer.on(LOG_CHANNEL.Line, (_event, line: RuntimeLogLine) => {
			listener(line);
		});
	},
});
