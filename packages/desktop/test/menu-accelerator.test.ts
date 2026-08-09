import { describe, expect, it } from "vitest";

import { toElectronAccelerator } from "../src/menu/accelerator.js";

/**
 * The web UI writes accelerators in `react-hotkeys-hook` notation and Electron
 * wants its own. Electron silently ignores an accelerator it cannot parse — a
 * menu item just shows no shortcut, with no error anywhere — so the mapping is
 * pinned here rather than trusted.
 */
describe("toElectronAccelerator", () => {
	it.each([
		["mod+j", "CmdOrCtrl+J"],
		["mod+shift+s", "CmdOrCtrl+Shift+S"],
		["mod+b", "CmdOrCtrl+B"],
		["c", "C"],
		["ctrl+k", "Control+K"],
		["alt+enter", "Alt+Return"],
		["option+up", "Alt+Up"],
		["shift+escape", "Shift+Escape"],
		["cmd+space", "Command+Space"],
		["f5", "F5"],
	])("maps %j to %j", (input, expected) => {
		expect(toElectronAccelerator(input)).toBe(expected);
	});

	it("normalises case and stray whitespace", () => {
		expect(toElectronAccelerator(" MOD + Shift + S ")).toBe("CmdOrCtrl+Shift+S");
	});

	it("collapses a duplicated modifier", () => {
		// hotkeys-hook tolerates the repeat; Electron rejects the whole string.
		expect(toElectronAccelerator("mod+mod+j")).toBe("CmdOrCtrl+J");
	});

	it.each([
		["nothing", null],
		["an empty string", ""],
		["only a modifier", "mod"],
		["a trailing modifier", "mod+shift"],
		["an unknown modifier", "hyper+j"],
	])("returns null for %s", (_label, input) => {
		expect(toElectronAccelerator(input)).toBeNull();
	});
});
