import { describe, expect, it } from "vitest";

import {
	DESKTOP_BRIDGE_VERSION,
	DESKTOP_CAPABILITIES,
	MIN_SUPPORTED_DESKTOP_BRIDGE_VERSION,
	encodeBridgeBootstrapArg,
	isDesktopCapability,
	parseBridgeBootstrapArg,
	toDesktopPlatform,
} from "../src/bridge/contract.js";

describe("toDesktopPlatform", () => {
	it.each(["darwin", "win32", "linux"] as const)(
		"passes %s through unchanged",
		(platform) => {
			expect(toDesktopPlatform(platform)).toBe(platform);
		},
	);

	it.each(["freebsd", "aix", "sunos", "android", ""])(
		"collapses unsupported platform %j to 'other'",
		(platform) => {
			expect(toDesktopPlatform(platform)).toBe("other");
		},
	);
});

describe("isDesktopCapability", () => {
	it("accepts every declared capability", () => {
		for (const capability of DESKTOP_CAPABILITIES) {
			expect(isDesktopCapability(capability)).toBe(true);
		}
	});

	it("rejects unknown strings and non-strings", () => {
		expect(isDesktopCapability("teleportation")).toBe(false);
		expect(isDesktopCapability("")).toBe(false);
		expect(isDesktopCapability(null)).toBe(false);
		expect(isDesktopCapability(42)).toBe(false);
		expect(isDesktopCapability(["windows"])).toBe(false);
	});
});

describe("bridge bootstrap argument", () => {
	it("round-trips through argv", () => {
		const bootstrap = {
			appVersion: "1.2.3",
			capabilities: ["windows", "runtime"] as const,
		};
		const argv = ["electron", ".", encodeBridgeBootstrapArg(bootstrap)];

		expect(parseBridgeBootstrapArg(argv)).toEqual(bootstrap);
	});

	it("survives characters that would break a bare argv join", () => {
		// The payload is percent-encoded precisely so a version string with
		// spaces, quotes or an `=` can't truncate or split the argument.
		const bootstrap = {
			appVersion: '1.0.0-beta "one two" =x&y',
			capabilities: [] as const,
		};
		const argv = [encodeBridgeBootstrapArg(bootstrap)];

		expect(parseBridgeBootstrapArg(argv)?.appVersion).toBe(
			bootstrap.appVersion,
		);
	});

	it("drops capabilities this build does not recognise", () => {
		// Forward compatibility: a newer shell advertising a capability we've
		// never heard of must stay usable for the ones we do know.
		const arg = encodeBridgeBootstrapArg({
			appVersion: "2.0.0",
			capabilities: ["windows", "teleportation", "runtime"] as never,
		});

		expect(parseBridgeBootstrapArg([arg])).toEqual({
			appVersion: "2.0.0",
			capabilities: ["windows", "runtime"],
		});
	});

	it("returns null when no bootstrap argument is present", () => {
		expect(parseBridgeBootstrapArg([])).toBeNull();
		expect(parseBridgeBootstrapArg(["electron", ".", "--inspect"])).toBeNull();
	});

	it.each([
		["malformed JSON", "--kanban-desktop-bridge=%7Bnope"],
		["a JSON primitive", "--kanban-desktop-bridge=%22hello%22"],
		["null", "--kanban-desktop-bridge=null"],
		["a missing appVersion", "--kanban-desktop-bridge=%7B%22capabilities%22%3A%5B%5D%7D"],
		[
			"a non-array capabilities field",
			"--kanban-desktop-bridge=%7B%22appVersion%22%3A%221.0.0%22%2C%22capabilities%22%3A%22windows%22%7D",
		],
	])("returns null for %s", (_label, arg) => {
		expect(parseBridgeBootstrapArg([arg])).toBeNull();
	});

	it("ignores unrelated arguments around the bootstrap", () => {
		const arg = encodeBridgeBootstrapArg({
			appVersion: "3.1.4",
			capabilities: ["runtime"],
		});

		expect(
			parseBridgeBootstrapArg(["--enable-logging", arg, "--no-sandbox"]),
		).toEqual({ appVersion: "3.1.4", capabilities: ["runtime"] });
	});
});

describe("version constants", () => {
	it("keeps the minimum supported version reachable by the current build", () => {
		// A minimum above the current version would make every shell look
		// unsupported to its own renderer.
		expect(MIN_SUPPORTED_DESKTOP_BRIDGE_VERSION).toBeLessThanOrEqual(
			DESKTOP_BRIDGE_VERSION,
		);
	});
});
