import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_DESKTOP_SETTINGS,
	loadDesktopSettings,
	parseDesktopSettings,
	resolveSettingsPath,
	saveDesktopSettings,
} from "../src/settings/desktop-settings.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), "kanban-settings-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe("parseDesktopSettings", () => {
	it("reads a well-formed object", () => {
		expect(
			parseDesktopSettings({
				runtimeHost: "localhost",
				runtimePort: 4000,
				summonAccelerator: "CmdOrCtrl+Alt+K",
			}),
		).toEqual({
			runtimeHost: "localhost",
			runtimePort: 4000,
			summonAccelerator: "CmdOrCtrl+Alt+K",
		});
	});

	it.each([
		["null", null],
		["undefined", undefined],
		["a string", "nope"],
		["an array", []],
	])("falls back entirely for %s", (_label, raw) => {
		expect(parseDesktopSettings(raw)).toEqual(DEFAULT_DESKTOP_SETTINGS);
	});

	it("falls back per field, not per file", () => {
		// One bad value must not discard a good one sitting next to it.
		expect(parseDesktopSettings({ runtimeHost: "example.internal", runtimePort: "x" })).toEqual({
			runtimeHost: "example.internal",
			runtimePort: DEFAULT_DESKTOP_SETTINGS.runtimePort,
			summonAccelerator: DEFAULT_DESKTOP_SETTINGS.summonAccelerator,
		});
	});

	it.each([
		["zero", 0],
		["negative", -1],
		["above the port range", 70_000],
		["fractional", 80.5],
		["a numeric string", "8080"],
	])("rejects a %s port", (_label, runtimePort) => {
		expect(parseDesktopSettings({ runtimePort }).runtimePort).toBe(
			DEFAULT_DESKTOP_SETTINGS.runtimePort,
		);
	});

	it.each([
		["a scheme", "http://evil.test"],
		["a port suffix", "127.0.0.1:9999"],
		["a path", "127.0.0.1/admin"],
		["credentials", "user@evil.test"],
		["an empty string", "   "],
	])("rejects a host carrying %s", (_label, runtimeHost) => {
		// The host is interpolated into the origin the shell health-checks and
		// loads windows from, so anything beyond a bare host could redirect
		// the app at a different origin entirely.
		expect(parseDesktopSettings({ runtimeHost }).runtimeHost).toBe(
			DEFAULT_DESKTOP_SETTINGS.runtimeHost,
		);
	});

	it("keeps an empty summon accelerator as a deliberate opt-out", () => {
		// Falling back to the default here would re-enable a shortcut the user
		// explicitly turned off, every launch.
		expect(parseDesktopSettings({ summonAccelerator: "" }).summonAccelerator).toBe("");
	});

	it("falls back for a non-string summon accelerator", () => {
		expect(parseDesktopSettings({ summonAccelerator: 42 }).summonAccelerator).toBe(
			DEFAULT_DESKTOP_SETTINGS.summonAccelerator,
		);
	});

	it("accepts a bracketed IPv6 literal", () => {
		expect(parseDesktopSettings({ runtimeHost: "[::1]" }).runtimeHost).toBe("[::1]");
	});

	it("trims surrounding whitespace from the host", () => {
		expect(parseDesktopSettings({ runtimeHost: "  localhost  " }).runtimeHost).toBe(
			"localhost",
		);
	});
});

describe("loadDesktopSettings", () => {
	it("returns defaults when no file exists", () => {
		expect(loadDesktopSettings(dir)).toEqual(DEFAULT_DESKTOP_SETTINGS);
	});

	it("round-trips through save", () => {
		const settings = {
			runtimeHost: "localhost",
			runtimePort: 5555,
			summonAccelerator: "CmdOrCtrl+Alt+K",
		};
		saveDesktopSettings(dir, settings);

		expect(loadDesktopSettings(dir)).toEqual(settings);
	});

	it("falls back to defaults on unparseable JSON", () => {
		// The app must start regardless of what is on disk.
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		writeFileSync(resolveSettingsPath(dir), "{not json", "utf-8");

		expect(loadDesktopSettings(dir)).toEqual(DEFAULT_DESKTOP_SETTINGS);
		expect(warn).toHaveBeenCalledOnce();
	});

	it("leaves no temp file behind after a save", () => {
		saveDesktopSettings(dir, DEFAULT_DESKTOP_SETTINGS);

		expect(loadDesktopSettings(dir)).toEqual(DEFAULT_DESKTOP_SETTINGS);
	});
});
