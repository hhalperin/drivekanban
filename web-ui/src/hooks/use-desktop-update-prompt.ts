import type { DesktopUpdateStatus } from "@desktop-bridge";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseDesktopUpdatePromptResult {
	dismissed: boolean;
	dismiss: () => void;
}

/**
 * Tracks whether the user has dismissed the "update ready" prompt.
 *
 * Dismissal is per-version, not per-session. A user who clicks "Later" has
 * answered for *that* update; if a newer one downloads later that is a fresh
 * question and the prompt should return. Tying it to the session instead
 * would silently suppress every subsequent update until the app restarts —
 * on a machine left running for days, that could be all of them.
 */
export function useDesktopUpdatePrompt(status: DesktopUpdateStatus): UseDesktopUpdatePromptResult {
	const readyVersion = status.kind === "ready" ? status.version : null;
	const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
	const readyVersionRef = useRef(readyVersion);

	useEffect(() => {
		readyVersionRef.current = readyVersion;
	}, [readyVersion]);

	const dismiss = useCallback(() => {
		setDismissedVersion(readyVersionRef.current);
	}, []);

	return {
		dismissed: readyVersion !== null && dismissedVersion === readyVersion,
		dismiss,
	};
}
