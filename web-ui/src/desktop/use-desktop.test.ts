import { describe, expect, it } from "vitest";

import { isDesktopShell, useDesktop } from "./use-desktop";

/**
 * jsdom has no `window.desktop`, so this file exercises the browser-mode
 * path — the one every web user takes, and the one a regression would break
 * silently. The shell-present paths are covered in `desktop-bridge.test.ts`,
 * where the candidate object is passed in directly rather than having to be
 * installed on a global before module load.
 */
describe("useDesktop in a browser", () => {
	it("reports no shell", () => {
		expect(useDesktop()).toBeNull();
		expect(isDesktopShell()).toBe(false);
	});

	it("returns a stable reference across calls", () => {
		// Components may pass the client into dependency arrays; a new object
		// per call would re-fire every effect that depends on it.
		expect(useDesktop()).toBe(useDesktop());
	});
});
