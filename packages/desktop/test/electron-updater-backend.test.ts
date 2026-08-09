import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// electron-updater is CommonJS and defines `autoUpdater` via
// `Object.defineProperty`, which cjs-module-lexer cannot statically detect.
// A named import (`import { autoUpdater } from "electron-updater"`) therefore
// typechecks, passes every unit test — the controller's tests use a fake
// backend and never load this module — and then throws
//
//   SyntaxError: The requested module 'electron-updater' does not provide an
//   export named 'autoUpdater'
//
// the first time the *packaged* ESM main process imports it. That is a
// launch-blocking crash reachable only from a real build, so it is guarded
// here at the source level, the same way main.ts's structural invariants are.
// ---------------------------------------------------------------------------

const backendSrc = readFileSync(
	new URL("../src/updater/electron-updater-backend.ts", import.meta.url),
	"utf-8",
);

describe("electron-updater import style", () => {
	it("imports electron-updater as a default import", () => {
		expect(backendSrc).toMatch(
			/import\s+electronUpdater\s+from\s+"electron-updater"/,
		);
	});

	it("never uses a named import from electron-updater", () => {
		expect(backendSrc).not.toMatch(/import\s*\{[^}]*\}\s*from\s*"electron-updater"/);
	});

	it("reads autoUpdater inside the factory, not at module scope", () => {
		// The property is a lazy getter that constructs a platform updater on
		// first access. main.ts imports this module unconditionally, so a
		// module-scope read would instantiate an updater even in unpackaged
		// runs where `resolveUpdateSupport` has already ruled updates out.
		const factoryStart = backendSrc.indexOf(
			"export function createElectronUpdaterBackend",
		);
		const destructureIdx = backendSrc.indexOf("const { autoUpdater } = electronUpdater");

		expect(factoryStart).toBeGreaterThan(-1);
		expect(destructureIdx).toBeGreaterThan(factoryStart);
	});
});
