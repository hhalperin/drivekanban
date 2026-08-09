/**
 * The single entry point the app uses to reach the Electron shell.
 *
 * No component should read `window.desktop` directly: doing so scatters
 * capability checks and makes browser mode easy to break. Call `useDesktop()`
 * and branch on `null` (browser) or `has(capability)` (shell without that
 * feature).
 *
 *   const desktop = useDesktop();
 *   if (desktop?.has("windows")) desktop.windows.openProject(projectId);
 */

import { DESKTOP_BRIDGE_GLOBAL } from "@desktop-bridge";

import { createDesktopClient, type DesktopClient } from "./desktop-bridge";

/**
 * The bridge is installed by the preload script before any app code runs and
 * never changes afterwards, so it is resolved once at module load. That also
 * keeps the version-mismatch warning in `createDesktopClient` to a single
 * line per page load instead of one per component mount.
 */
const desktopClient: DesktopClient | null = createDesktopClient(
	typeof window === "undefined" ? undefined : (window as unknown as Record<string, unknown>)[DESKTOP_BRIDGE_GLOBAL],
);

export function useDesktop(): DesktopClient | null {
	return desktopClient;
}

/** True when running inside the Electron shell rather than a browser. */
export function isDesktopShell(): boolean {
	return desktopClient !== null;
}

export type { DesktopClient };
