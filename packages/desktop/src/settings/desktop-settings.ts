/**
 * Persisted shell preferences.
 *
 * Small and deliberately separate from the runtime's own config: these are
 * decisions about the *shell* (which runtime to talk to), and they have to be
 * readable before the runtime exists.
 *
 * The file is optional and every field has a default, so a missing or
 * corrupt file is a normal state rather than an error — the app must start
 * regardless of what is on disk.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface DesktopSettings {
	/** Host the shell expects the runtime on. */
	runtimeHost: string;
	/** Port the shell expects the runtime on. */
	runtimePort: number;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
	runtimeHost: "127.0.0.1",
	runtimePort: 3484,
};

export function resolveSettingsPath(userDataPath: string): string {
	return path.join(userDataPath, "desktop-settings.json");
}

function isValidPort(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value > 0 &&
		value <= 65_535
	);
}

/**
 * Reject a host that is not a bare hostname or IP literal.
 *
 * The value is interpolated into the origin the shell health-checks and loads
 * windows from, so anything carrying a scheme, port, path, or credentials
 * could redirect the app at a different origin entirely.
 */
function isValidHost(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const host = value.trim();
	if (host.length === 0 || host.length > 253) return false;
	return /^[a-z0-9.-]+$/i.test(host) || /^\[[0-9a-f:]+\]$/i.test(host);
}

/**
 * Parse a settings object, falling back per-field.
 *
 * Field-level rather than whole-file fallback: one bad value should not
 * discard a perfectly good one next to it.
 */
export function parseDesktopSettings(raw: unknown): DesktopSettings {
	if (typeof raw !== "object" || raw === null) {
		return { ...DEFAULT_DESKTOP_SETTINGS };
	}
	const record = raw as Record<string, unknown>;
	return {
		runtimeHost: isValidHost(record.runtimeHost)
			? record.runtimeHost.trim()
			: DEFAULT_DESKTOP_SETTINGS.runtimeHost,
		runtimePort: isValidPort(record.runtimePort)
			? record.runtimePort
			: DEFAULT_DESKTOP_SETTINGS.runtimePort,
	};
}

export function loadDesktopSettings(userDataPath: string): DesktopSettings {
	const filePath = resolveSettingsPath(userDataPath);
	if (!existsSync(filePath)) return { ...DEFAULT_DESKTOP_SETTINGS };
	try {
		return parseDesktopSettings(JSON.parse(readFileSync(filePath, "utf-8")));
	} catch (err) {
		// Logged rather than surfaced: the app starts fine on defaults, and a
		// modal about a config file the user may never have touched is worse
		// than a line in the log.
		console.warn(
			"[desktop] Failed to read settings from",
			filePath,
			"—",
			err instanceof Error ? err.message : err,
		);
		return { ...DEFAULT_DESKTOP_SETTINGS };
	}
}

export function saveDesktopSettings(
	userDataPath: string,
	settings: DesktopSettings,
): void {
	try {
		const filePath = resolveSettingsPath(userDataPath);
		// Write-then-rename, matching window-state.ts: a crash mid-write must
		// not leave a truncated file that reads back as corrupt.
		const tmpPath = `${filePath}.tmp`;
		writeFileSync(tmpPath, JSON.stringify(settings, null, "\t"), "utf-8");
		renameSync(tmpPath, filePath);
	} catch (err) {
		console.warn(
			"[desktop] Failed to save settings:",
			err instanceof Error ? err.message : err,
		);
	}
}
