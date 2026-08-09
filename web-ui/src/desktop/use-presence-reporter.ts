import type { DesktopPresenceCounts } from "@desktop-bridge";
import { useEffect, useMemo } from "react";

import type { BoardData } from "@/types";

import { useDesktop } from "./use-desktop";

/**
 * Derive the shell's presence counts from the board.
 *
 * Uses the board columns the user already sees rather than inventing a second
 * notion of "busy": whatever the dock badge says has to match what the board
 * shows, or the badge stops being trusted.
 *
 * Exported for tests.
 */
export function countPresence(board: BoardData): DesktopPresenceCounts {
	let running = 0;
	let readyForReview = 0;
	for (const column of board.columns) {
		if (column.id === "in_progress") {
			running += column.cards.length;
		} else if (column.id === "review") {
			readyForReview += column.cards.length;
		}
	}
	return { running, readyForReview };
}

/**
 * Keep the desktop shell's badge, tray and quit guard in sync with the board.
 *
 * A no-op in a browser, and cheap in the shell: the effect only fires when a
 * count actually changes, not on every board re-render.
 */
export function usePresenceReporter(board: BoardData): void {
	const desktop = useDesktop();
	const hasPresence = desktop?.has("presence") ?? false;
	const counts = useMemo(() => countPresence(board), [board]);

	useEffect(() => {
		if (!hasPresence || !desktop) return;
		desktop.presence.setCounts(counts);
		// Depending on the individual numbers rather than the object keeps this
		// from re-sending on every board update that leaves the counts alone —
		// which, on a busy board, is most of them.
	}, [desktop, hasPresence, counts.running, counts.readyForReview]);
}
