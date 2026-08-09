/**
 * Main-process half of the `window.desktop` bridge.
 *
 * Owns channel registration and payload validation only — the actual
 * behaviour lives in the handlers the caller supplies, so this module stays
 * free of Electron imports and is testable with a fake `ipcMain`.
 */

import { DesktopChannel } from "./contract.js";
import {
	openProjectWindowPayloadSchema,
	restartRuntimePayloadSchema,
} from "./ipc-schemas.js";

/**
 * The slice of `ipcMain` this module needs. Structural, so tests can pass a
 * recorder and `ipcMain` itself satisfies it without a cast.
 */
export interface IpcMainLike {
	on(
		channel: string,
		listener: (event: unknown, ...args: unknown[]) => void,
	): unknown;
}

export interface DesktopBridgeHandlers {
	openProjectWindow(projectId: string): void;
	restartRuntime(): void;
}

function warnInvalidPayload(channel: string, error: unknown): void {
	// A dropped message with no diagnostic is close to impossible to debug
	// from a packaged app, where the renderer's own console is the only other
	// clue and it has no idea the main process refused it.
	console.warn(
		`[desktop] Rejected malformed payload on ${channel}:`,
		error instanceof Error ? error.message : error,
	);
}

export function registerDesktopBridge(
	ipc: IpcMainLike,
	handlers: DesktopBridgeHandlers,
): void {
	ipc.on(DesktopChannel.OpenProjectWindow, (_event, payload) => {
		const parsed = openProjectWindowPayloadSchema.safeParse(payload);
		if (!parsed.success) {
			warnInvalidPayload(DesktopChannel.OpenProjectWindow, parsed.error);
			return;
		}
		handlers.openProjectWindow(parsed.data.projectId);
	});

	ipc.on(DesktopChannel.RestartRuntime, (_event, payload) => {
		const parsed = restartRuntimePayloadSchema.safeParse(payload);
		if (!parsed.success) {
			warnInvalidPayload(DesktopChannel.RestartRuntime, parsed.error);
			return;
		}
		handlers.restartRuntime();
	});
}
