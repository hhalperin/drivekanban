import { describe, expect, it } from "vitest";

import type { BoardColumnId, BoardData } from "@/types";

import { countPresence } from "./use-presence-reporter";

function board(counts: Partial<Record<BoardColumnId, number>>): BoardData {
	const columns: BoardColumnId[] = ["backlog", "in_progress", "review", "trash"];
	return {
		columns: columns.map((id) => ({
			id,
			title: id,
			cards: Array.from({ length: counts[id] ?? 0 }, (_, index) => ({
				id: `${id}-${index}`,
			})),
		})),
		dependencies: [],
	} as unknown as BoardData;
}

describe("countPresence", () => {
	it("counts in-progress tasks as running", () => {
		expect(countPresence(board({ in_progress: 3 }))).toEqual({
			running: 3,
			readyForReview: 0,
		});
	});

	it("counts review tasks as ready for review", () => {
		expect(countPresence(board({ review: 2 }))).toEqual({
			running: 0,
			readyForReview: 2,
		});
	});

	it("ignores backlog and trash", () => {
		// Backlog tasks have no agent working and trashed ones are gone;
		// counting either would put a number on the dock that never clears.
		expect(countPresence(board({ backlog: 9, trash: 5 }))).toEqual({
			running: 0,
			readyForReview: 0,
		});
	});

	it("reports both counts together", () => {
		expect(countPresence(board({ backlog: 4, in_progress: 2, review: 1, trash: 3 }))).toEqual({
			running: 2,
			readyForReview: 1,
		});
	});

	it("returns zeroes for an empty board", () => {
		expect(countPresence(board({}))).toEqual({ running: 0, readyForReview: 0 });
	});
});
