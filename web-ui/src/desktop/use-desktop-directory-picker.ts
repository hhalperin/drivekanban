import { useCallback } from "react";

import { useDesktop } from "./use-desktop";

export type DesktopDirectoryPicker = (options?: { title?: string }) => Promise<string | null>;

/**
 * The shell's native folder picker, or `null` in a browser.
 *
 * Returning `null` rather than a no-op function is deliberate: callers need
 * to know whether to take this path at all, since the fallback is a different
 * flow (the runtime's picker, or the in-app file browser) and not just a
 * different implementation of the same call.
 */
export function useDesktopDirectoryPicker(): DesktopDirectoryPicker | null {
	const desktop = useDesktop();
	const hasDialogs = desktop?.has("dialogs") ?? false;

	const pick = useCallback<DesktopDirectoryPicker>(
		(options) => desktop?.dialogs.pickDirectory(options) ?? Promise.resolve(null),
		[desktop],
	);

	return hasDialogs ? pick : null;
}
