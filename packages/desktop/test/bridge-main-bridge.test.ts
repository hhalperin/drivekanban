import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import {
	DesktopChannel,
	type DesktopUpdateStatus,
} from "../src/bridge/contract.js";
import type {
	NotifyPayload,
	PresenceCountsPayload,
} from "../src/bridge/ipc-schemas.js";
import {
	type IpcMainLike,
	registerDesktopBridge,
} from "../src/bridge/main-bridge.js";

type Listener = (event: unknown, ...args: unknown[]) => void;

class FakeIpcMain implements IpcMainLike {
	private readonly listeners = new Map<string, Listener>();
	private readonly handlers = new Map<
		string,
		(event: unknown, ...args: unknown[]) => unknown
	>();

	on(channel: string, listener: Listener): this {
		this.listeners.set(channel, listener);
		return this;
	}

	handle(
		channel: string,
		handler: (event: unknown, ...args: unknown[]) => unknown,
	): this {
		this.handlers.set(channel, handler);
		return this;
	}

	send(channel: string, ...args: unknown[]): void {
		const listener = this.listeners.get(channel);
		if (!listener) throw new Error(`No listener registered for ${channel}`);
		listener({}, ...args);
	}

	invoke(channel: string, ...args: unknown[]): unknown {
		const handler = this.handlers.get(channel);
		if (!handler) throw new Error(`No handler registered for ${channel}`);
		return handler({}, ...args);
	}

	get channels(): string[] {
		return [...this.listeners.keys()];
	}

	get invokableChannels(): string[] {
		return [...this.handlers.keys()];
	}
}

let ipc: FakeIpcMain;
let handlers: {
	openProjectWindow: Mock<(projectId: string) => void>;
	restartRuntime: Mock<() => void>;
	getUpdateStatus: Mock<() => DesktopUpdateStatus>;
	checkForUpdates: Mock<() => void>;
	installUpdate: Mock<() => void>;
	notify: Mock<(request: NotifyPayload) => void>;
	setPresenceCounts: Mock<(counts: PresenceCountsPayload) => void>;
};
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	ipc = new FakeIpcMain();
	handlers = {
		openProjectWindow: vi.fn(),
		restartRuntime: vi.fn(),
		getUpdateStatus: vi.fn(() => ({ kind: "idle" }) as const),
		checkForUpdates: vi.fn(),
		installUpdate: vi.fn(),
		notify: vi.fn(),
		setPresenceCounts: vi.fn(),
	};
	warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	registerDesktopBridge(ipc, handlers);
});

afterEach(() => {
	// `spyOn` reuses an existing spy on re-entry, so without an explicit
	// restore the warn counts accumulate across tests and every
	// `toHaveBeenCalledOnce` after the first would fail.
	vi.restoreAllMocks();
});

describe("registerDesktopBridge", () => {
	it("registers exactly the declared send channels", () => {
		expect(ipc.channels.sort()).toEqual(
			[
				DesktopChannel.OpenProjectWindow,
				DesktopChannel.RestartRuntime,
				DesktopChannel.CheckForUpdates,
				DesktopChannel.InstallUpdate,
				DesktopChannel.Notify,
				DesktopChannel.SetPresenceCounts,
			].sort(),
		);
	});

	it("registers exactly the declared invoke channels", () => {
		expect(ipc.invokableChannels).toEqual([DesktopChannel.GetUpdateStatus]);
	});

	it("does not accept the push-only status channel as inbound", () => {
		// `UpdateStatusChanged` is main → renderer. Accepting it inbound would
		// let a compromised renderer forge status updates for every window.
		expect(ipc.channels).not.toContain(DesktopChannel.UpdateStatusChanged);
		expect(ipc.invokableChannels).not.toContain(
			DesktopChannel.UpdateStatusChanged,
		);
	});
});

describe("update channels", () => {
	it("returns the current status from the invoke handler", () => {
		handlers.getUpdateStatus.mockReturnValue({ kind: "ready", version: "2.0.0" });

		expect(ipc.invoke(DesktopChannel.GetUpdateStatus)).toEqual({
			kind: "ready",
			version: "2.0.0",
		});
	});

	it("forwards check and install", () => {
		ipc.send(DesktopChannel.CheckForUpdates);
		ipc.send(DesktopChannel.InstallUpdate);

		expect(handlers.checkForUpdates).toHaveBeenCalledOnce();
		expect(handlers.installUpdate).toHaveBeenCalledOnce();
	});

	it.each([
		[DesktopChannel.CheckForUpdates, "checkForUpdates"],
		[DesktopChannel.InstallUpdate, "installUpdate"],
	] as const)("drops a payload sent on %s", (channel, handlerName) => {
		ipc.send(channel, { sneaky: true });

		expect(handlers[handlerName]).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledOnce();
	});
});

describe("open-project-window channel", () => {
	it("forwards a valid projectId", () => {
		ipc.send(DesktopChannel.OpenProjectWindow, { projectId: "proj-1" });

		expect(handlers.openProjectWindow).toHaveBeenCalledExactlyOnceWith("proj-1");
	});

	it("trims surrounding whitespace before forwarding", () => {
		ipc.send(DesktopChannel.OpenProjectWindow, { projectId: "  proj-2  " });

		expect(handlers.openProjectWindow).toHaveBeenCalledExactlyOnceWith("proj-2");
	});

	it.each([
		["an empty projectId", { projectId: "" }],
		["a whitespace-only projectId", { projectId: "   " }],
		["a non-string projectId", { projectId: 7 }],
		["a null projectId", { projectId: null }],
		["a missing projectId", {}],
		["a bare string instead of an object", "proj-1"],
		["an array", ["proj-1"]],
		["null", null],
		["nothing at all", undefined],
	])("drops %s without calling the handler", (_label, payload) => {
		ipc.send(DesktopChannel.OpenProjectWindow, payload);

		expect(handlers.openProjectWindow).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledOnce();
	});

	it("keeps serving valid messages after rejecting a bad one", () => {
		ipc.send(DesktopChannel.OpenProjectWindow, { projectId: "" });
		ipc.send(DesktopChannel.OpenProjectWindow, { projectId: "proj-3" });

		expect(handlers.openProjectWindow).toHaveBeenCalledExactlyOnceWith("proj-3");
	});
});

describe("restart-runtime channel", () => {
	it("invokes the handler when sent with no payload", () => {
		ipc.send(DesktopChannel.RestartRuntime);

		expect(handlers.restartRuntime).toHaveBeenCalledOnce();
	});

	it.each([
		["an object", { force: true }],
		["a string", "now"],
		["null", null],
	])("drops a restart carrying %s", (_label, payload) => {
		ipc.send(DesktopChannel.RestartRuntime, payload);

		expect(handlers.restartRuntime).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledOnce();
	});
});
