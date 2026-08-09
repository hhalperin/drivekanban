import type { DesktopUpdateStatus } from "@desktop-bridge";
import { useEffect, useRef, useState } from "react";

import { useDesktop } from "./use-desktop";

const BROWSER_STATUS: DesktopUpdateStatus = {
	kind: "unsupported",
	reason: "Automatic updates are only available in the desktop app.",
};

/**
 * Live desktop update status.
 *
 * Returns `unsupported` in a browser, so callers can render one code path and
 * branch on the status rather than on whether a shell is present.
 */
export function useDesktopUpdateStatus(): DesktopUpdateStatus {
	const desktop = useDesktop();
	const [status, setStatus] = useState<DesktopUpdateStatus>(BROWSER_STATUS);
	const pushedRef = useRef(false);

	useEffect(() => {
		if (!desktop) return;

		let cancelled = false;
		pushedRef.current = false;

		// Subscribe before the initial fetch so a status change landing during
		// the round-trip isn't missed.
		const unsubscribe = desktop.updates.subscribe((next) => {
			pushedRef.current = true;
			if (!cancelled) setStatus(next);
		});

		void desktop.updates.getStatus().then((initial) => {
			// A push that arrived while the fetch was in flight is newer than
			// what the fetch returned; applying the stale snapshot on top would
			// visibly walk the UI backwards (a download reverting to "checking").
			if (cancelled || pushedRef.current) return;
			setStatus(initial);
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [desktop]);

	return status;
}
