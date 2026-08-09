/**
 * Right-click menu and spell checking for renderer content.
 *
 * Electron ships neither by default. Writing task prompts is the app's main
 * text-entry activity, so until now the composer had no cut/copy/paste menu
 * and no spell checking at all — a papercut every single time.
 *
 * The menu template is built by a pure function so the decisions (which items
 * appear for a link vs. a text selection vs. a misspelled word) are testable
 * without an Electron runtime.
 */

/** The slice of Electron's `ContextMenuParams` this module reads. */
export interface ContextMenuContext {
	isEditable: boolean;
	selectionText: string;
	linkURL: string;
	misspelledWord: string;
	dictionarySuggestions: readonly string[];
	editFlags: {
		canCut: boolean;
		canCopy: boolean;
		canPaste: boolean;
		canSelectAll: boolean;
	};
}

export interface ContextMenuActions {
	replaceMisspelling: (replacement: string) => void;
	addToDictionary: (word: string) => void;
	copyLink: (url: string) => void;
	openLink: (url: string) => void;
}

/**
 * A menu item, in Electron's `MenuItemConstructorOptions` shape but typed
 * locally so this file stays free of the `electron` import.
 */
export interface ContextMenuItem {
	label?: string;
	role?: string;
	type?: "separator";
	enabled?: boolean;
	click?: () => void;
}

/** How many dictionary suggestions to show before it stops being a menu. */
const MAX_SUGGESTIONS = 5;

export function buildContextMenuTemplate(
	context: ContextMenuContext,
	actions: ContextMenuActions,
): ContextMenuItem[] {
	const sections: ContextMenuItem[][] = [];

	// Spelling first: when the user right-clicks a squiggle, the suggestion is
	// what they came for, and burying it under Cut/Copy/Paste makes the
	// feature feel absent.
	if (context.isEditable && context.misspelledWord) {
		const suggestions = context.dictionarySuggestions
			.slice(0, MAX_SUGGESTIONS)
			.map((suggestion) => ({
				label: suggestion,
				click: () => actions.replaceMisspelling(suggestion),
			}));
		const spelling: ContextMenuItem[] =
			suggestions.length > 0
				? suggestions
				: [{ label: "No spelling suggestions", enabled: false }];
		spelling.push({
			label: "Add to Dictionary",
			click: () => actions.addToDictionary(context.misspelledWord),
		});
		sections.push(spelling);
	}

	if (context.linkURL) {
		sections.push([
			{ label: "Open Link in Browser", click: () => actions.openLink(context.linkURL) },
			{ label: "Copy Link Address", click: () => actions.copyLink(context.linkURL) },
		]);
	}

	// Roles delegate to the focused webContents, so they work without any
	// wiring — but they must still be *offered* only where they apply.
	const editing: ContextMenuItem[] = [];
	if (context.isEditable) {
		editing.push({ role: "undo" }, { role: "redo" }, { type: "separator" });
	}
	if (context.isEditable || context.selectionText) {
		if (context.isEditable) editing.push({ role: "cut", enabled: context.editFlags.canCut });
		editing.push({ role: "copy", enabled: context.editFlags.canCopy });
	}
	if (context.isEditable) {
		editing.push({ role: "paste", enabled: context.editFlags.canPaste });
	}
	if (editing.length > 0) {
		if (context.editFlags.canSelectAll) {
			editing.push({ type: "separator" }, { role: "selectAll" });
		}
		sections.push(editing);
	}

	return joinSections(sections);
}

/**
 * Concatenate sections with separators between them, dropping empty ones so
 * a menu never opens with a leading or doubled divider.
 */
function joinSections(sections: ContextMenuItem[][]): ContextMenuItem[] {
	const populated = sections.filter((section) => section.length > 0);
	const items: ContextMenuItem[] = [];
	populated.forEach((section, index) => {
		if (index > 0) items.push({ type: "separator" });
		items.push(...section);
	});
	// A trailing separator is possible when a section ends with one (the
	// editing section does, before selectAll is skipped).
	while (items.length > 0 && items[items.length - 1]?.type === "separator") {
		items.pop();
	}
	return items;
}
