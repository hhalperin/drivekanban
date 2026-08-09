import { Menu, app, shell } from "electron";

import type { DesktopMenuAction } from "./bridge/contract.js";
import { toElectronAccelerator } from "./menu/accelerator.js";
import type { RuntimeOrchestrator } from "./runtime-orchestrator.js";
import type { WindowRegistry } from "./window-registry.js";
import { extractPersistablePath } from "./window-state.js";

/**
 * `shell.openExternal` returns a Promise that can reject if the OS denies
 * the open (no default browser, policy restriction, malformed URL). Wrap
 * with a `.catch` so a Help-menu click never produces an unhandled
 * rejection — failure should surface as a console warning, not crash the
 * Electron renderer-warnings pipeline.
 */
/** Windows beyond this many are reachable from the menu list, but not by key. */
const MAX_WINDOW_ACCELERATORS = 9;

function openExternalSafe(url: string): void {
	shell.openExternal(url).catch((err: unknown) => {
		console.warn(
			"[desktop] shell.openExternal failed:",
			err instanceof Error ? err.message : err,
		);
	});
}


interface AppMenuOptions {

	registry: WindowRegistry;
	orchestrator: RuntimeOrchestrator;
	onNewWindow: (options: { initialPath: string | null }) => void;
	/** Invoked when the user picks a published app action. */
	onInvokeAction: (actionId: string) => void;
	onShowRuntimeLogs: () => void;
}

export class AppMenu {
	private actions: readonly DesktopMenuAction[] = [];

	constructor(private readonly opts: AppMenuOptions) {}

	/**
	 * Replace the app-action items and re-render.
	 *
	 * The renderer republishes whenever availability changes, so this is
	 * called often; rebuilding the whole menu is what Electron supports and
	 * is cheap next to the IPC that carried the list.
	 */
	setActions(actions: readonly DesktopMenuAction[]): void {
		this.actions = actions;
		this.rebuild();
	}

	rebuild(): void {
		Menu.setApplicationMenu(Menu.buildFromTemplate(this.buildTemplate()));
	}

	private buildTemplate(): Electron.MenuItemConstructorOptions[] {
		const isMac = process.platform === "darwin";
		const ready = this.opts.orchestrator.getUrl() !== null;

		const appMenu: Electron.MenuItemConstructorOptions = {
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		};

		const fileMenu: Electron.MenuItemConstructorOptions = {
			label: "File",
			submenu: [
				{
					label: "New Window",
					accelerator: isMac ? "CmdOrCtrl+Shift+N" : "Ctrl+Shift+N",
					click: () => this.handleNewWindow(),
				},
				{ type: "separator" },
				isMac ? { role: "close" } : { role: "quit" },
			],
		};

		const editMenu: Electron.MenuItemConstructorOptions = {
			label: "Edit",
			// Edit roles delegate to the focused webContents and don't depend on
			// the runtime being connected. Leaving them enabled means users on
			// the disconnected screen can still copy error text, paste a config
			// URL, etc. — which they'd otherwise have to do via the system
			// keyboard shortcuts only.
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		};


		const viewMenu: Electron.MenuItemConstructorOptions = {
			label: "View",
			submenu: [
				{ role: "reload", enabled: ready },
				...(!app.isPackaged
					? ([
							{ role: "forceReload", enabled: ready },
							{ role: "toggleDevTools" },
						] as Electron.MenuItemConstructorOptions[])
					: []),
				{ type: "separator" },
				{ role: "resetZoom", enabled: ready },
				{ role: "zoomIn", enabled: ready },
				{ role: "zoomOut", enabled: ready },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		};

		const helpMenu: Electron.MenuItemConstructorOptions = {
			label: "Help",
			submenu: [
				{
					label: "Kanban Documentation",
					click: () => openExternalSafe("https://github.com/cline/kanban"),
				},
				{
					label: "Report Issue",
					click: () =>
						openExternalSafe("https://github.com/cline/kanban/issues"),
				},
				{ type: "separator" },
				{
					// Always enabled: the logs are most wanted precisely when the
					// runtime failed to start, which is when `ready` is false.
					label: "Show Runtime Logs",
					click: () => this.opts.onShowRuntimeLogs(),
				},
			],
		};

		const template: Electron.MenuItemConstructorOptions[] = [];
		if (isMac) template.push(appMenu);
		template.push(fileMenu, editMenu, viewMenu);
		// Only rendered once the renderer has published something. An empty
		// "Commands" menu would be worse than no menu at all.
		const commandsMenu = this.buildCommandsMenu(ready);
		if (commandsMenu) template.push(commandsMenu);
		template.push(this.buildWindowMenu(isMac), helpMenu);
		return template;
	}

	/**
	 * Menu items for the actions the renderer published, grouped in the order
	 * the groups first appear so the menu matches the command palette.
	 */
	private buildCommandsMenu(
		ready: boolean,
	): Electron.MenuItemConstructorOptions | null {
		if (this.actions.length === 0) return null;

		const groups: string[] = [];
		for (const action of this.actions) {
			if (!groups.includes(action.group)) groups.push(action.group);
		}

		const submenu: Electron.MenuItemConstructorOptions[] = [];
		for (const group of groups) {
			if (submenu.length > 0) submenu.push({ type: "separator" });
			for (const action of this.actions.filter((item) => item.group === group)) {
				const accelerator = toElectronAccelerator(action.accelerator);
				submenu.push({
					label: action.label,
					// The renderer's own hotkey handler also fires on this key.
					// `registerAccelerator: false` shows the shortcut in the menu
					// without Electron binding it, so the action runs once rather
					// than twice.
					...(accelerator ? { accelerator, registerAccelerator: false } : {}),
					// A disconnected runtime means there is no renderer to receive
					// the invoke, so grey the whole set out rather than sending
					// into the void.
					enabled: ready && action.enabled,
					click: () => this.opts.onInvokeAction(action.id),
				});
			}
		}

		return { label: "Commands", submenu };
	}

	private buildWindowMenu(isMac: boolean): Electron.MenuItemConstructorOptions {
		const windowEntries = this.opts.registry.getVisible();
		const focused = this.opts.registry.getFocused();
		const windowListItems: Electron.MenuItemConstructorOptions[] =
			windowEntries.map((entry, index) => {
				const title = entry.window.isDestroyed()
					? "Kanban"
					: entry.window.getTitle() || "Kanban";
				return {
					label: title,
					type: "checkbox" as const,
					checked: focused?.id === entry.window.id,
					// Cmd/Ctrl+1..9 jumps straight to the Nth window — the way
					// every tabbed app works, and the fastest route between
					// projects for someone running several at once. Only the
					// first nine get one; beyond that the list itself is the UI.
					...(index < MAX_WINDOW_ACCELERATORS
						? { accelerator: `CmdOrCtrl+${index + 1}` }
						: {}),
					click: () => {
						if (!entry.window.isDestroyed()) {
							if (entry.window.isMinimized()) entry.window.restore();
							entry.window.focus();
						}
					},
				};
			});

		return {
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				...(windowListItems.length > 0
					? [
							{ type: "separator" } as Electron.MenuItemConstructorOptions,
							...windowListItems,
						]
					: []),
				...(isMac
					? [
							{ type: "separator" } as Electron.MenuItemConstructorOptions,
							{ role: "front" } as Electron.MenuItemConstructorOptions,
						]
					: [{ role: "close" } as Electron.MenuItemConstructorOptions]),
			],
		};
	}

	private handleNewWindow(): void {
		const focused = this.opts.registry.getFocused();
		const currentUrl =
			focused && !focused.isDestroyed()
				? focused.webContents.getURL()
				: null;
		this.opts.onNewWindow({ initialPath: extractPersistablePath(currentUrl) });
	}
}
