/**
 * The only module that touches `electron-updater`.
 *
 * Its whole job is translating that library's event vocabulary into the
 * narrow `UpdaterBackend` the controller consumes, so a future change in the
 * updater library lands here and nowhere else.
 */

import { autoUpdater } from "electron-updater";

import type { UpdaterBackend, UpdaterBackendEvent } from "./update-controller.js";

export function createElectronUpdaterBackend(): UpdaterBackend {
	// Download as soon as an update is found, but never install behind the
	// user's back: a desktop app whose agents may be mid-task must not decide
	// on its own when to quit. `install()` is an explicit user action.
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = false;

	return {
		subscribe(emit: (event: UpdaterBackendEvent) => void): void {
			autoUpdater.on("checking-for-update", () => emit({ kind: "checking" }));
			autoUpdater.on("update-not-available", () => emit({ kind: "up-to-date" }));
			autoUpdater.on("update-available", (info) =>
				emit({ kind: "available", version: info.version }),
			);
			autoUpdater.on("download-progress", (progress) =>
				emit({ kind: "progress", percent: progress.percent }),
			);
			autoUpdater.on("update-downloaded", (event) =>
				emit({ kind: "ready", version: event.version }),
			);
			autoUpdater.on("error", (error) =>
				emit({
					kind: "error",
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		},

		async checkForUpdates(): Promise<void> {
			await autoUpdater.checkForUpdates();
		},

		quitAndInstall(): void {
			// `quitAndInstall` closes every window and only then emits
			// `before-quit`, which is where the runtime child is torn down
			// gracefully. Leaving both flags at their defaults keeps that
			// ordering intact.
			autoUpdater.quitAndInstall();
		},
	};
}
