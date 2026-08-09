import { describe, expect, it, vi } from "vitest";

import { type AppAction, AppActionId, findAppAction, formatAccelerator, runAppAction } from "./app-actions";

function action(overrides: Partial<AppAction> = {}): AppAction {
	return {
		id: AppActionId.CreateTask,
		label: "New Task",
		group: "Task",
		accelerator: "c",
		enabled: true,
		run: vi.fn(),
		...overrides,
	};
}

describe("runAppAction", () => {
	it("runs a matching enabled action", () => {
		const run = vi.fn();
		const actions = [action({ run })];

		expect(runAppAction(actions, AppActionId.CreateTask)).toBe(true);
		expect(run).toHaveBeenCalledOnce();
	});

	it("ignores a disabled action", () => {
		// The desktop menu is rebuilt asynchronously, so a click can land
		// against an action that has since become unavailable.
		const run = vi.fn();

		expect(runAppAction([action({ enabled: false, run })], AppActionId.CreateTask)).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});

	it("ignores an id this build does not know", () => {
		// Across shell/web-UI version skew the menu may still carry an id that
		// has since been dropped. Silently ignoring beats throwing.
		expect(() => runAppAction([action()], "task.teleport")).not.toThrow();
		expect(runAppAction([action()], "task.teleport")).toBe(false);
	});

	it("runs only the matching action", () => {
		const createRun = vi.fn();
		const settingsRun = vi.fn();
		const actions = [action({ run: createRun }), action({ id: AppActionId.OpenSettings, run: settingsRun })];

		runAppAction(actions, AppActionId.OpenSettings);

		expect(settingsRun).toHaveBeenCalledOnce();
		expect(createRun).not.toHaveBeenCalled();
	});
});

describe("findAppAction", () => {
	it("finds by id", () => {
		expect(findAppAction([action()], AppActionId.CreateTask)?.label).toBe("New Task");
	});

	it("returns undefined for a missing id", () => {
		expect(findAppAction([action()], AppActionId.OpenSettings)).toBeUndefined();
	});
});

describe("formatAccelerator", () => {
	it.each([
		["mod+j", "⌘J"],
		["mod+shift+s", "⌘⇧S"],
		["c", "C"],
		["alt+enter", "⌥Enter"],
		["ctrl+k", "⌃K"],
	])("renders %j on macOS as %j", (accelerator, expected) => {
		expect(formatAccelerator(accelerator, true)).toBe(expected);
	});

	it.each([
		["mod+j", "Ctrl+J"],
		["mod+shift+s", "Ctrl+Shift+S"],
		["c", "C"],
		["alt+enter", "Alt+Enter"],
	])("renders %j elsewhere as %j", (accelerator, expected) => {
		expect(formatAccelerator(accelerator, false)).toBe(expected);
	});

	it("returns null when there is no accelerator", () => {
		expect(formatAccelerator(null, true)).toBeNull();
	});
});
