import { contextBridge, ipcRenderer } from "electron";

import {
	DESKTOP_BRIDGE_GLOBAL,
	DESKTOP_BRIDGE_VERSION,
	type DesktopApi,
	DesktopChannel,
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
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_GLOBAL, desktopApi);
