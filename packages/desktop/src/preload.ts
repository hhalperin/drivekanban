import { contextBridge, ipcRenderer } from "electron";

import {
	DESKTOP_BRIDGE_GLOBAL,
	DESKTOP_BRIDGE_VERSION,
	type DesktopApi,
	DesktopChannel,
	type DesktopNotificationRequest,
	type DesktopPresenceCounts,
	type DesktopUpdateStatus,
	parseBridgeBootstrapArg,
	toDesktopPlatform,
} from "./bridge/contract.js";

/**
 * A missing bootstrap argument means `WindowRegistry` failed to pass one —
 * a wiring bug, not a user-facing condition. Degrade to a handshake that
 * advertises no capabilities: the renderer stays on its browser-mode code
 * paths and the app keeps working, while the error names the actual fault.
 */
const bootstrap = parseBridgeBootstrapArg(process.argv);
if (!bootstrap) {
	console.error(
		"[desktop] Bridge bootstrap argument missing — exposing a capability-less bridge.",
	);
}

const desktopApi: DesktopApi = {
	bridgeVersion: DESKTOP_BRIDGE_VERSION,
	platform: toDesktopPlatform(process.platform),
	appVersion: bootstrap?.appVersion ?? "unknown",
	capabilities: bootstrap?.capabilities ?? [],

	windows: {
		openProject(projectId: string): void {
			ipcRenderer.send(DesktopChannel.OpenProjectWindow, { projectId });
		},
	},

	runtime: {
		restart(): void {
			ipcRenderer.send(DesktopChannel.RestartRuntime);
		},
	},

	presence: {
		setCounts(counts: DesktopPresenceCounts): void {
			ipcRenderer.send(DesktopChannel.SetPresenceCounts, counts);
		},
	},

	notifications: {
		notify(request: DesktopNotificationRequest): void {
			ipcRenderer.send(DesktopChannel.Notify, request);
		},
	},

	updates: {
		getStatus(): Promise<DesktopUpdateStatus> {
			return ipcRenderer.invoke(
				DesktopChannel.GetUpdateStatus,
			) as Promise<DesktopUpdateStatus>;
		},

		check(): void {
			ipcRenderer.send(DesktopChannel.CheckForUpdates);
		},

		install(): void {
			ipcRenderer.send(DesktopChannel.InstallUpdate);
		},

		subscribe(listener: (status: DesktopUpdateStatus) => void): () => void {
			// The renderer's callback is never handed to `ipcRenderer` directly:
			// doing so would leak the raw IpcRendererEvent (and its `sender`)
			// across the context bridge. Only the status payload crosses.
			const forward = (_event: unknown, status: DesktopUpdateStatus): void => {
				listener(status);
			};
			ipcRenderer.on(DesktopChannel.UpdateStatusChanged, forward);
			return () => {
				ipcRenderer.off(DesktopChannel.UpdateStatusChanged, forward);
			};
		},
	},
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_GLOBAL, desktopApi);
