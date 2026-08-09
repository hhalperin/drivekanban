import { DESKTOP_BRIDGE_VERSION } from "@desktop-bridge";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDesktopClient } from "./desktop-bridge";

interface FakeBridgeOverrides {
	bridgeVersion?: unknown;
	platform?: unknown;
	appVersion?: unknown;
	capabilities?: unknown;
	windows?: unknown;
	runtime?: unknown;
}

function fakeBridge(overrides: FakeBridgeOverrides = {}): Record<string, unknown> {
	return {
		bridgeVersion: DESKTOP_BRIDGE_VERSION,
		platform: "darwin",
		appVersion: "1.2.3",
		capabilities: ["windows", "runtime"],
		windows: { openProject: vi.fn() },
		runtime: { restart: vi.fn() },
		...overrides,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createDesktopClient — browser mode", () => {
	it.each([
		["undefined", undefined],
		["null", null],
		["a string", "desktop"],
		["a number", 1],
		["an array", []],
	])("returns null for %s", (_label, candidate) => {
		expect(createDesktopClient(candidate)).toBeNull();
	});

	it("returns null when bridgeVersion is not a finite number", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(createDesktopClient(fakeBridge({ bridgeVersion: "1" }))).toBeNull();
		expect(createDesktopClient(fakeBridge({ bridgeVersion: Number.NaN }))).toBeNull();
	});

	it("returns null for a shell older than the minimum supported version", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(createDesktopClient(fakeBridge({ bridgeVersion: 0 }))).toBeNull();
		expect(warn).toHaveBeenCalledOnce();
	});
});

describe("createDesktopClient — handshake", () => {
	it("reads the handshake fields", () => {
		const client = createDesktopClient(fakeBridge());

		expect(client).not.toBeNull();
		expect(client?.bridgeVersion).toBe(DESKTOP_BRIDGE_VERSION);
		expect(client?.platform).toBe("darwin");
		expect(client?.appVersion).toBe("1.2.3");
		expect(client?.capabilities.slice().sort()).toEqual(["runtime", "windows"]);
	});

	it("normalises an unrecognised platform to 'other'", () => {
		expect(createDesktopClient(fakeBridge({ platform: "freebsd" }))?.platform).toBe("other");
		expect(createDesktopClient(fakeBridge({ platform: 42 }))?.platform).toBe("other");
	});

	it("falls back to 'unknown' for a missing appVersion", () => {
		expect(createDesktopClient(fakeBridge({ appVersion: undefined }))?.appVersion).toBe("unknown");
	});

	it("accepts a newer bridge version", () => {
		// Newer shells stay usable — features are gated on capabilities, not
		// on the version, so a bump alone must not drop the renderer to
		// browser mode.
		const client = createDesktopClient(fakeBridge({ bridgeVersion: DESKTOP_BRIDGE_VERSION + 5 }));

		expect(client).not.toBeNull();
		expect(client?.has("windows")).toBe(true);
	});
});

describe("createDesktopClient — capabilities", () => {
	it("reports only advertised capabilities", () => {
		const client = createDesktopClient(fakeBridge({ capabilities: ["windows"] }));

		expect(client?.has("windows")).toBe(true);
		expect(client?.has("runtime")).toBe(false);
		expect(client?.capabilities).toEqual(["windows"]);
	});

	it("ignores capabilities it does not recognise", () => {
		const client = createDesktopClient(fakeBridge({ capabilities: ["windows", "teleportation"] }));

		expect(client?.capabilities).toEqual(["windows"]);
	});

	it.each([
		["a non-array capabilities field", "windows"],
		["a missing capabilities field", undefined],
	])("treats %s as no capabilities", (_label, capabilities) => {
		const client = createDesktopClient(fakeBridge({ capabilities }));

		expect(client).not.toBeNull();
		expect(client?.capabilities).toEqual([]);
	});

	it("drops a capability whose method is missing", () => {
		// Version skew: the shell claims `windows` but its namespace no longer
		// carries the method this build calls. Reporting it as absent keeps the
		// renderer on the browser path instead of throwing at the call site.
		const client = createDesktopClient(fakeBridge({ windows: { somethingElse: vi.fn() } }));

		expect(client?.has("windows")).toBe(false);
		expect(client?.has("runtime")).toBe(true);
	});

	it("drops a capability whose namespace is missing entirely", () => {
		expect(createDesktopClient(fakeBridge({ runtime: undefined }))?.has("runtime")).toBe(false);
	});
});

describe("createDesktopClient — method dispatch", () => {
	it("forwards openProject to the shell", () => {
		const openProject = vi.fn();
		const client = createDesktopClient(fakeBridge({ windows: { openProject } }));

		client?.windows.openProject("proj-1");

		expect(openProject).toHaveBeenCalledExactlyOnceWith("proj-1");
	});

	it("forwards restart to the shell", () => {
		const restart = vi.fn();
		const client = createDesktopClient(fakeBridge({ runtime: { restart } }));

		client?.runtime.restart();

		expect(restart).toHaveBeenCalledOnce();
	});

	it("is a no-op — not a throw — when the capability is absent", () => {
		const openProject = vi.fn();
		const client = createDesktopClient(fakeBridge({ capabilities: [], windows: { openProject } }));

		expect(() => client?.windows.openProject("proj-1")).not.toThrow();
		expect(() => client?.runtime.restart()).not.toThrow();
		expect(openProject).not.toHaveBeenCalled();
	});

	it("calls the shell method with the namespace as its receiver", () => {
		// The preload's methods are plain object properties today, but binding
		// guards against a future shell that keeps per-namespace state on
		// `this` and would otherwise break in a way only reproducible in a
		// packaged build.
		const windows = {
			marker: "windows-ns",
			receiver: null as unknown,
			openProject(this: { marker: string }) {
				windows.receiver = this.marker;
			},
		};
		const client = createDesktopClient(fakeBridge({ windows }));

		client?.windows.openProject("proj-1");

		expect(windows.receiver).toBe("windows-ns");
	});
});
