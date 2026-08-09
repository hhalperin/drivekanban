/**
 * Translate the web UI's `react-hotkeys-hook` accelerators into Electron's
 * menu accelerator syntax.
 *
 * The two notations overlap enough to look interchangeable and are not:
 * `mod` vs `CmdOrCtrl`, `ctrl` vs `Control`, lowercase vs capitalised keys.
 * Electron silently ignores an accelerator it cannot parse, so a wrong
 * translation shows a menu item with no shortcut and no error — which is why
 * this is a separate, tested function rather than an inline replace.
 */

const MODIFIERS: Record<string, string> = {
	mod: "CmdOrCtrl",
	cmd: "Command",
	command: "Command",
	meta: "Command",
	ctrl: "Control",
	control: "Control",
	shift: "Shift",
	alt: "Alt",
	option: "Alt",
};

/** Keys whose Electron name differs from the lowercase hotkeys-hook name. */
const NAMED_KEYS: Record<string, string> = {
	esc: "Escape",
	escape: "Escape",
	enter: "Return",
	return: "Return",
	space: "Space",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	up: "Up",
	down: "Down",
	left: "Left",
	right: "Right",
	plus: "Plus",
};

/**
 * Returns `null` when the accelerator is absent or cannot be represented —
 * the caller then renders the menu item without a shortcut, which is correct
 * and visible, rather than passing Electron something it will drop.
 */
export function toElectronAccelerator(
	accelerator: string | null | undefined,
): string | null {
	if (!accelerator) return null;

	const parts = accelerator
		.split("+")
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
	if (parts.length === 0) return null;

	const key = parts[parts.length - 1];
	const modifierParts = parts.slice(0, -1);
	if (!key || key in MODIFIERS) {
		// A trailing modifier means there is no actual key to bind.
		return null;
	}

	const modifiers: string[] = [];
	for (const part of modifierParts) {
		const mapped = MODIFIERS[part];
		if (!mapped) return null;
		// Electron rejects a duplicated modifier; hotkeys-hook tolerates it.
		if (!modifiers.includes(mapped)) modifiers.push(mapped);
	}

	const named = NAMED_KEYS[key];
	const renderedKey = named ?? (key.length === 1 ? key.toUpperCase() : capitalize(key));

	return [...modifiers, renderedKey].join("+");
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
