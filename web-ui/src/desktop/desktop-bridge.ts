/**
 * Renderer-side reader for the `window.desktop` bridge.
 *
 * The web UI has to run unchanged in a plain browser, so nothing here may
 * assume the bridge exists. `createDesktopClient` is the only place that
 * inspects the raw global: it validates the handshake, works out which
 * capabilities are genuinely backed by callable methods, and hands back a
 * client that is safe to call unconditionally. Everything else in the app
 * goes through `useDesktop()`.
 *
 * Kept free of React so the validation can be tested as a pure function.
 */

import {
	type DesktopApi,
	type DesktopCapability,
	type DesktopRuntimeApi,
	type DesktopWindowsApi,
	isDesktopCapability,
	MIN_SUPPORTED_DESKTOP_BRIDGE_VERSION,
	toDesktopPlatform,
} from "@desktop-bridge";

export interface DesktopClient extends DesktopApi {
	/**
	 * Whether `capability` is both advertised by the shell *and* backed by a
	 * callable method on this bridge. Callers should gate desktop-only UI on
	 * this rather than on `capabilities` directly — the two differ exactly
	 * when a shell and a web UI from different releases meet.
	 */
	has(capability: DesktopCapability): boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readMethod(
	source: Record<string, unknown>,
	namespace: string,
	method: string,
): ((...args: never[]) => void) | null {
	const ns = source[namespace];
	if (!isRecord(ns)) return null;
	const fn = ns[method];
	return typeof fn === "function" ? (fn as (...args: never[]) => void).bind(ns) : null;
}

/**
 * Validate a candidate bridge object and wrap it in a client.
 *
 * Returns `null` — meaning "run in browser mode" — when the global is
 * absent, is not an object, or reports a handshake version this build
 * predates. Browser mode is always a safe fallback, so rejecting is
 * preferable to guessing at an unfamiliar shape.
 */
export function createDesktopClient(candidate: unknown): DesktopClient | null {
	if (!isRecord(candidate)) return null;

	const bridgeVersion = candidate.bridgeVersion;
	if (typeof bridgeVersion !== "number" || !Number.isFinite(bridgeVersion)) {
		console.warn("[desktop] Ignoring bridge with a non-numeric bridgeVersion:", bridgeVersion);
		return null;
	}
	if (bridgeVersion < MIN_SUPPORTED_DESKTOP_BRIDGE_VERSION) {
		console.warn(
			`[desktop] Shell bridge v${bridgeVersion} predates the minimum supported v${MIN_SUPPORTED_DESKTOP_BRIDGE_VERSION} — running in browser mode.`,
		);
		return null;
	}

	const openProject = readMethod(candidate, "windows", "openProject");
	const restart = readMethod(candidate, "runtime", "restart");

	// A capability counts only when the shell advertises it *and* the method
	// behind it survived validation. Version skew shows up as exactly this
	// mismatch, and treating it as "absent" keeps the renderer on its browser
	// path instead of calling into a method that isn't there.
	const advertised = new Set(
		Array.isArray(candidate.capabilities) ? candidate.capabilities.filter(isDesktopCapability) : [],
	);
	const effective = new Set<DesktopCapability>();
	if (openProject && advertised.has("windows")) effective.add("windows");
	if (restart && advertised.has("runtime")) effective.add("runtime");

	const windows: DesktopWindowsApi = {
		openProject(projectId) {
			if (effective.has("windows")) openProject?.(projectId as never);
		},
	};

	const runtime: DesktopRuntimeApi = {
		restart() {
			if (effective.has("runtime")) restart?.();
		},
	};

	return {
		bridgeVersion,
		platform: toDesktopPlatform(typeof candidate.platform === "string" ? candidate.platform : ""),
		appVersion: typeof candidate.appVersion === "string" ? candidate.appVersion : "unknown",
		capabilities: [...effective],
		windows,
		runtime,
		has: (capability) => effective.has(capability),
	};
}
