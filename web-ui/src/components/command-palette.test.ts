import { describe, expect, it } from "vitest";

import { shiftPositions } from "./command-palette";

/**
 * fzf matches against `"<group> <label>"` so a query like "view terminal"
 * finds "Toggle Terminal", but the highlight renders over the label alone.
 * Without the shift, highlights land on the wrong characters.
 */
describe("shiftPositions", () => {
	it("rebases positions onto the label", () => {
		// "View Toggle Terminal" — offset 5 puts index 5 at the label's start.
		expect(shiftPositions(new Set([5, 6, 12]), 5)).toEqual(new Set([0, 1, 7]));
	});

	it("drops positions that matched inside the group prefix", () => {
		// A match on "View" itself has nothing to highlight in the label.
		expect(shiftPositions(new Set([0, 1, 2, 7]), 5)).toEqual(new Set([2]));
	});

	it("returns an empty set when every match was in the prefix", () => {
		expect(shiftPositions(new Set([0, 3]), 5)).toEqual(new Set());
	});

	it("handles an empty position set", () => {
		expect(shiftPositions(new Set(), 5)).toEqual(new Set());
	});

	it("is identity at offset zero", () => {
		expect(shiftPositions(new Set([0, 4]), 0)).toEqual(new Set([0, 4]));
	});
});
