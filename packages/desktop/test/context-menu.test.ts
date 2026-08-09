import { describe, expect, it, vi } from "vitest";

import {
	buildContextMenuTemplate,
	type ContextMenuActions,
	type ContextMenuContext,
} from "../src/menu/context-menu.js";

function context(overrides: Partial<ContextMenuContext> = {}): ContextMenuContext {
	return {
		isEditable: false,
		selectionText: "",
		linkURL: "",
		misspelledWord: "",
		dictionarySuggestions: [],
		editFlags: {
			canCut: false,
			canCopy: false,
			canPaste: false,
			canSelectAll: true,
		},
		...overrides,
	};
}

function actions(): ContextMenuActions {
	return {
		replaceMisspelling: vi.fn(),
		addToDictionary: vi.fn(),
		copyLink: vi.fn(),
		openLink: vi.fn(),
	};
}

function labels(items: ReturnType<typeof buildContextMenuTemplate>): string[] {
	return items.map((item) => item.label ?? item.role ?? item.type ?? "");
}

describe("empty contexts", () => {
	it("produces no menu for a plain non-editable click with nothing selected", () => {
		// Popping an empty menu on every background right-click would be worse
		// than having no context menu at all.
		const items = buildContextMenuTemplate(
			context({ editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: false } }),
			actions(),
		);

		expect(items).toEqual([]);
	});
});

describe("editable fields", () => {
	it("offers the full editing set", () => {
		const items = buildContextMenuTemplate(
			context({
				isEditable: true,
				editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
			}),
			actions(),
		);

		expect(labels(items)).toEqual([
			"undo",
			"redo",
			"separator",
			"cut",
			"copy",
			"paste",
			"separator",
			"selectAll",
		]);
	});

	it("disables actions the field cannot perform", () => {
		const items = buildContextMenuTemplate(
			context({
				isEditable: true,
				editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
			}),
			actions(),
		);
		const byRole = new Map(items.map((item) => [item.role, item.enabled]));

		expect(byRole.get("cut")).toBe(false);
		expect(byRole.get("copy")).toBe(false);
		expect(byRole.get("paste")).toBe(true);
	});
});

describe("selected text outside a field", () => {
	it("offers copy but not cut or paste", () => {
		const items = buildContextMenuTemplate(
			context({
				selectionText: "hello",
				editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: true },
			}),
			actions(),
		);

		expect(labels(items)).toEqual(["copy", "separator", "selectAll"]);
	});
});

describe("spelling", () => {
	it("puts suggestions first", () => {
		// The squiggle is what the user right-clicked; burying the fix under
		// Cut/Copy/Paste makes spellcheck feel absent.
		const items = buildContextMenuTemplate(
			context({
				isEditable: true,
				misspelledWord: "teh",
				dictionarySuggestions: ["the", "tech"],
				editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
			}),
			actions(),
		);

		expect(labels(items).slice(0, 4)).toEqual([
			"the",
			"tech",
			"Add to Dictionary",
			"separator",
		]);
	});

	it("caps how many suggestions are shown", () => {
		const items = buildContextMenuTemplate(
			context({
				isEditable: true,
				misspelledWord: "x",
				dictionarySuggestions: ["a", "b", "c", "d", "e", "f", "g"],
			}),
			actions(),
		);

		expect(labels(items).slice(0, 5)).toEqual(["a", "b", "c", "d", "e"]);
		expect(labels(items)).not.toContain("f");
	});

	it("says so when there are no suggestions", () => {
		const items = buildContextMenuTemplate(
			context({ isEditable: true, misspelledWord: "asdfgh", dictionarySuggestions: [] }),
			actions(),
		);

		const noSuggestions = items.find((item) => item.label === "No spelling suggestions");
		expect(noSuggestions?.enabled).toBe(false);
	});

	it("replaces the word when a suggestion is chosen", () => {
		const handlers = actions();
		const items = buildContextMenuTemplate(
			context({ isEditable: true, misspelledWord: "teh", dictionarySuggestions: ["the"] }),
			handlers,
		);

		items.find((item) => item.label === "the")?.click?.();

		expect(handlers.replaceMisspelling).toHaveBeenCalledExactlyOnceWith("the");
	});

	it("adds the original word to the dictionary", () => {
		const handlers = actions();
		const items = buildContextMenuTemplate(
			context({ isEditable: true, misspelledWord: "kanban", dictionarySuggestions: [] }),
			handlers,
		);

		items.find((item) => item.label === "Add to Dictionary")?.click?.();

		expect(handlers.addToDictionary).toHaveBeenCalledExactlyOnceWith("kanban");
	});

	it("ignores a misspelling reported outside an editable field", () => {
		// Nothing can be replaced there, so the items would be dead.
		const items = buildContextMenuTemplate(
			context({ misspelledWord: "teh", dictionarySuggestions: ["the"] }),
			actions(),
		);

		expect(labels(items)).not.toContain("the");
	});
});

describe("links", () => {
	it("offers open and copy", () => {
		const handlers = actions();
		const items = buildContextMenuTemplate(
			context({ linkURL: "https://example.com" }),
			handlers,
		);

		items.find((item) => item.label === "Open Link in Browser")?.click?.();
		items.find((item) => item.label === "Copy Link Address")?.click?.();

		expect(handlers.openLink).toHaveBeenCalledExactlyOnceWith("https://example.com");
		expect(handlers.copyLink).toHaveBeenCalledExactlyOnceWith("https://example.com");
	});
});

describe("separators", () => {
	it("never starts or ends with one", () => {
		const items = buildContextMenuTemplate(
			context({
				isEditable: true,
				misspelledWord: "teh",
				dictionarySuggestions: ["the"],
				linkURL: "https://example.com",
				editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
			}),
			actions(),
		);

		expect(items[0]?.type).not.toBe("separator");
		expect(items[items.length - 1]?.type).not.toBe("separator");
	});

	it("never emits two in a row", () => {
		const items = buildContextMenuTemplate(
			context({
				isEditable: true,
				editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: false },
			}),
			actions(),
		);

		for (let index = 1; index < items.length; index += 1) {
			const doubled =
				items[index]?.type === "separator" && items[index - 1]?.type === "separator";
			expect(doubled).toBe(false);
		}
	});
});
