/**
 * Main-process half of the `window.desktop` bridge.
 *
 * Owns channel registration and payload validation only — the actual
 * behaviour lives in the handlers the caller supplies, so this module stays
 * free of Electron imports and is testable with a fake `ipcMain`.
 */

import { DesktopChannel, type DesktopUpdateStatus } from "./contract.js";
import {
	emptyPayloadSchema,
	type MenuActionsPayload,
	menuActionsPayloadSchema,
	type NotifyPayload,
	notifyPayloadSchema,
	type PresenceCountsPayload,
	presenceCountsPayloadSchema,
	openProjectWindowPayloadSchema,
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
	handle(
		channel: string,
		listener: (event: unknown, ...args: unknown[]) => unknown,
	): unknown;
}

export interface DesktopBridgeHandlers {
	openProjectWindow(projectId: string): void;
	restartRuntime(): void;
	getUpdateStatus(): DesktopUpdateStatus;
	checkForUpdates(): void;
	installUpdate(): void;
	notify(request: NotifyPayload): void;
	setPresenceCounts(counts: PresenceCountsPayload): void;
	publishActions(actions: MenuActionsPayload): void;
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

	registerEmptyPayloadChannel(ipc, DesktopChannel.RestartRuntime, () =>
		handlers.restartRuntime(),
	);
	registerEmptyPayloadChannel(ipc, DesktopChannel.CheckForUpdates, () =>
		handlers.checkForUpdates(),
	);
	registerEmptyPayloadChannel(ipc, DesktopChannel.InstallUpdate, () =>
		handlers.installUpdate(),
	);

	ipc.on(DesktopChannel.Notify, (_event, payload) => {
		const parsed = notifyPayloadSchema.safeParse(payload);
		if (!parsed.success) {
			warnInvalidPayload(DesktopChannel.Notify, parsed.error);
			return;
		}
		handlers.notify(parsed.data);
	});

	ipc.on(DesktopChannel.SetPresenceCounts, (_event, payload) => {
		const parsed = presenceCountsPayloadSchema.safeParse(payload);
		if (!parsed.success) {
			warnInvalidPayload(DesktopChannel.SetPresenceCounts, parsed.error);
			return;
		}
		handlers.setPresenceCounts(parsed.data);
	});

	ipc.on(DesktopChannel.PublishActions, (_event, payload) => {
		const parsed = menuActionsPayloadSchema.safeParse(payload);
		if (!parsed.success) {
			warnInvalidPayload(DesktopChannel.PublishActions, parsed.error);
			return;
		}
		handlers.publishActions(parsed.data);
	});

	// `handle`, not `on`: the renderer needs the current status synchronously
	// on mount, before any push has been emitted, or a window opened
	// mid-download would show "idle" until the next progress tick.
	ipc.handle(DesktopChannel.GetUpdateStatus, () => handlers.getUpdateStatus());
}

function registerEmptyPayloadChannel(
	ipc: IpcMainLike,
	channel: string,
	handle: () => void,
): void {
	ipc.on(channel, (_event, payload) => {
		const parsed = emptyPayloadSchema.safeParse(payload);
		if (!parsed.success) {
			warnInvalidPayload(channel, parsed.error);
			return;
		}
		handle();
	});
}
