import { useEffect, useMemo, useRef } from "react";

import { type AppAction, runAppAction } from "@/actions/app-actions";

import { useDesktop } from "./use-desktop";

/**
 * Mirror the action registry into the desktop menu bar, and run whatever the
 * user picks there.
 *
 * The menu is the only place a macOS user can rebind a shortcut (System
 * Settings → Keyboard → App Shortcuts only sees menu items), so publishing
 * the registry is what makes the app's shortcuts customisable at all.
 *
 * A no-op in a browser.
 */
export function useDesktopMenuActions(actions: readonly AppAction[]): void {
	const desktop = useDesktop();
	const hasActions = desktop?.has("actions") ?? false;

	// Handlers change identity on nearly every render; a ref keeps the
	// subscription from being torn down and re-established each time while
	// still dispatching against the current list.
	const actionsRef = useRef(actions);
	actionsRef.current = actions;

	// Only the serialisable fields cross the bridge, and only a change in one
	// of them should republish — re-sending on every render would rebuild the
	// OS menu continuously.
	const published = useMemo(
		() =>
			actions.map((action) => ({
				id: action.id,
				label: action.label,
				group: action.group,
				accelerator: action.accelerator,
				enabled: action.enabled,
			})),
		[actions],
	);

	useEffect(() => {
		if (!hasActions || !desktop) return;
		desktop.actions.publish(published);
	}, [desktop, hasActions, published]);

	useEffect(() => {
		if (!hasActions || !desktop) return;
		return desktop.actions.onInvoke((actionId) => {
			runAppAction(actionsRef.current, actionId);
		});
	}, [desktop, hasActions]);
}
