import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopChannel } from "../src/bridge/contract.js";
import {
	type IpcMainLike,
	registerDesktopBridge,
} from "../src/bridge/main-bridge.js";

type Listener = (event: unknown, ...args: unknown[]) => void;

class FakeIpcMain implements IpcMainLike {
	private readonly listeners = new Map<string, Listener>();

	on(channel: string, listener: Listener): this {
		this.listeners.set(channel, listener);
		return this;
	}

	send(channel: string, ...args: unknown[]): void {
		const listener = this.listeners.get(channel);
		if (!listener) throw new Error(`No listener registered for ${channel}`);
		listener({}, ...args);
	}

	get channels(): string[] {
		return [...this.listeners.keys()];
	}
}

let ipc: FakeIpcMain;
let handlers: { openProjectWindow: ReturnType<typeof vi.fn>; restartRuntime: ReturnType<typeof vi.fn> };
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	ipc = new FakeIpcMain();
	handlers = { openProjectWindow: vi.fn(), restartRuntime: vi.fn() };
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
	it("registers exactly the declared channels", () => {
		expect(ipc.channels.sort()).toEqual(
			[DesktopChannel.OpenProjectWindow, DesktopChannel.RestartRuntime].sort(),
		);
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
