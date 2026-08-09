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
	type DesktopUpdateStatus,
	type DesktopUpdatesApi,
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
): ((...args: never[]) => unknown) | null {
	const ns = source[namespace];
	if (!isRecord(ns)) return null;
	const fn = ns[method];
	return typeof fn === "function" ? (fn as (...args: never[]) => unknown).bind(ns) : null;
}

/**
 * Status reported when the shell can't tell us anything — a browser, or a
 * shell whose `updates` namespace failed validation. Distinct from an error:
 * nothing went wrong, there is simply no self-update mechanism here.
 */
const UPDATES_UNAVAILABLE: DesktopUpdateStatus = {
	kind: "unsupported",
	reason: "Automatic updates are unavailable in this build.",
};

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
	const getUpdateStatus = readMethod(candidate, "updates", "getStatus");
	const checkForUpdates = readMethod(candidate, "updates", "check");
	const installUpdate = readMethod(candidate, "updates", "install");
	const subscribeToUpdates = readMethod(candidate, "updates", "subscribe");

	const effective = new Set<DesktopCapability>();
	if (openProject && advertised.has("windows")) effective.add("windows");
	if (restart && advertised.has("runtime")) effective.add("runtime");
	// Every method has to be present: a half-wired namespace would let the UI
	// render an update prompt it can't act on.
	if (getUpdateStatus && checkForUpdates && installUpdate && subscribeToUpdates && advertised.has("updates")) {
		effective.add("updates");
	}

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

	const updates: DesktopUpdatesApi = {
		async getStatus() {
			if (!effective.has("updates")) return UPDATES_UNAVAILABLE;
			try {
				return (await getUpdateStatus?.()) as DesktopUpdateStatus;
			} catch (error) {
				// An IPC round-trip can reject if the window is tearing down.
				// Surface it as an error status rather than rejecting into a
				// caller that has no better recovery than showing the same thing.
				return {
					kind: "error",
					message: error instanceof Error ? error.message : String(error),
				};
			}
		},

		check() {
			if (effective.has("updates")) checkForUpdates?.();
		},

		install() {
			if (effective.has("updates")) installUpdate?.();
		},

		subscribe(listener) {
			if (!effective.has("updates")) return () => {};
			const unsubscribe = subscribeToUpdates?.(listener as never);
			return typeof unsubscribe === "function" ? (unsubscribe as () => void) : () => {};
		},
	};

	return {
		bridgeVersion,
		platform: toDesktopPlatform(typeof candidate.platform === "string" ? candidate.platform : ""),
		appVersion: typeof candidate.appVersion === "string" ? candidate.appVersion : "unknown",
		capabilities: [...effective],
		windows,
		runtime,
		updates,
		has: (capability) => effective.has(capability),
	};
}
