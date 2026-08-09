/**
 * The single definition of every app-level action.
 *
 * Five surfaces need to agree about what "Start All Tasks" is called, which
 * key runs it, and whether it is currently available: the keyboard shortcut,
 * the command palette, the desktop menu bar, the tray, and deep links. Before
 * this registry they would each have carried their own copy, and the copies
 * drift — a renamed shortcut that the menu still advertises is a bug users
 * report as "the menu is lying to me".
 *
 * Handlers live here too, so a surface only ever needs an action id.
 */

import { useMemo } from "react";

export const AppActionId = {
	CreateTask: "task.create",
	StartAllTasks: "task.start-all",
	ToggleTerminal: "terminal.toggle",
	ToggleTerminalExpanded: "terminal.toggle-expanded",
	ToggleGitHistory: "git.toggle-history",
	OpenSettings: "app.open-settings",
} as const;

export type AppActionId = (typeof AppActionId)[keyof typeof AppActionId];

/** Menu section an action belongs to. Ordered as listed. */
export const AppActionGroup = {
	Task: "Task",
	View: "View",
	App: "App",
} as const;

export type AppActionGroup = (typeof AppActionGroup)[keyof typeof AppActionGroup];

/**
 * Keyboard accelerators, in `react-hotkeys-hook` syntax.
 *
 * Declared here rather than at each `useHotkeys` call so the keyboard layer,
 * the palette and the desktop menu cannot advertise different keys for the
 * same action. `mod` resolves to Cmd on macOS and Ctrl elsewhere.
 */
export const APP_ACTION_ACCELERATORS = {
	[AppActionId.CreateTask]: "c",
	[AppActionId.StartAllTasks]: "mod+b",
	[AppActionId.ToggleTerminal]: "mod+j",
	[AppActionId.ToggleTerminalExpanded]: "mod+m",
	[AppActionId.ToggleGitHistory]: "mod+g",
	[AppActionId.OpenSettings]: "mod+shift+s",
} as const satisfies Record<AppActionId, string>;

/** Opens the command palette. Not an `AppAction` — it is the surface that
 * lists the others, so listing itself would be circular. */
export const COMMAND_PALETTE_ACCELERATOR = "mod+k";

export interface AppAction {
	id: AppActionId;
	label: string;
	group: AppActionGroup;
	/**
	 * `react-hotkeys-hook` syntax (`mod+j`). `mod` resolves to Cmd on macOS
	 * and Ctrl elsewhere, so the same string works on every platform.
	 */
	accelerator: string | null;
	/**
	 * False when the action cannot run right now — no project open, no task
	 * selected. Disabled actions stay *visible* in the palette and menu so the
	 * feature remains discoverable; they simply do nothing.
	 */
	enabled: boolean;
	run: () => void;
}

export interface AppActionHandlers {
	onCreateTask: () => void;
	onStartAllTasks: () => void;
	onToggleTerminal: () => void;
	onToggleTerminalExpanded: () => void;
	onToggleGitHistory: () => void;
	onOpenSettings: () => void;
}

export interface AppActionAvailability {
	canCreateTask: boolean;
	canToggleTerminalExpanded: boolean;
}

/**
 * Build the action list. Memoised on the handlers and availability so the
 * array identity is stable across renders — the desktop menu is rebuilt from
 * it, and a new array every render would rebuild the OS menu continuously.
 */
export function useAppActions(handlers: AppActionHandlers, availability: AppActionAvailability): AppAction[] {
	const {
		onCreateTask,
		onStartAllTasks,
		onToggleTerminal,
		onToggleTerminalExpanded,
		onToggleGitHistory,
		onOpenSettings,
	} = handlers;
	const { canCreateTask, canToggleTerminalExpanded } = availability;

	return useMemo(
		() => [
			{
				id: AppActionId.CreateTask,
				label: "New Task",
				group: AppActionGroup.Task,
				accelerator: APP_ACTION_ACCELERATORS[AppActionId.CreateTask],
				enabled: canCreateTask,
				run: onCreateTask,
			},
			{
				id: AppActionId.StartAllTasks,
				label: "Start All Tasks",
				group: AppActionGroup.Task,
				accelerator: APP_ACTION_ACCELERATORS[AppActionId.StartAllTasks],
				enabled: true,
				run: onStartAllTasks,
			},
			{
				id: AppActionId.ToggleTerminal,
				label: "Toggle Terminal",
				group: AppActionGroup.View,
				accelerator: APP_ACTION_ACCELERATORS[AppActionId.ToggleTerminal],
				enabled: true,
				run: onToggleTerminal,
			},
			{
				id: AppActionId.ToggleTerminalExpanded,
				label: "Expand Terminal",
				group: AppActionGroup.View,
				accelerator: APP_ACTION_ACCELERATORS[AppActionId.ToggleTerminalExpanded],
				enabled: canToggleTerminalExpanded,
				run: onToggleTerminalExpanded,
			},
			{
				id: AppActionId.ToggleGitHistory,
				label: "Toggle Git History",
				group: AppActionGroup.View,
				accelerator: APP_ACTION_ACCELERATORS[AppActionId.ToggleGitHistory],
				enabled: true,
				run: onToggleGitHistory,
			},
			{
				id: AppActionId.OpenSettings,
				label: "Settings",
				group: AppActionGroup.App,
				accelerator: APP_ACTION_ACCELERATORS[AppActionId.OpenSettings],
				enabled: true,
				run: onOpenSettings,
			},
		],
		[
			canCreateTask,
			canToggleTerminalExpanded,
			onCreateTask,
			onOpenSettings,
			onStartAllTasks,
			onToggleGitHistory,
			onToggleTerminal,
			onToggleTerminalExpanded,
		],
	);
}

export function findAppAction(actions: readonly AppAction[], id: AppActionId): AppAction | undefined {
	return actions.find((action) => action.id === id);
}

/**
 * Run an action by id, ignoring ids this build doesn't know and actions that
 * are currently unavailable.
 *
 * Both guards matter for the desktop menu: it is rebuilt asynchronously, so a
 * click can arrive against a menu whose action has since been disabled, or —
 * across a shell/web-UI version skew — for an id this build has dropped.
 */
export function runAppAction(actions: readonly AppAction[], id: string): boolean {
	const action = actions.find((candidate) => candidate.id === id);
	if (!action || !action.enabled) return false;
	action.run();
	return true;
}

/**
 * Render an accelerator for display (`mod+shift+s` → `⌘⇧S` / `Ctrl+Shift+S`).
 */
export function formatAccelerator(accelerator: string | null, isMac: boolean): string | null {
	if (!accelerator) return null;
	const parts = accelerator.split("+").map((part) => part.trim().toLowerCase());
	const rendered = parts.map((part) => {
		switch (part) {
			case "mod":
				return isMac ? "⌘" : "Ctrl";
			case "shift":
				return isMac ? "⇧" : "Shift";
			case "alt":
			case "option":
				return isMac ? "⌥" : "Alt";
			case "ctrl":
				return isMac ? "⌃" : "Ctrl";
			default:
				return part.length === 1 ? part.toUpperCase() : capitalize(part);
		}
	});
	// macOS renders modifiers as adjacent glyphs; everything else joins with +.
	return isMac ? rendered.join("") : rendered.join("+");
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
