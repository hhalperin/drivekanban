import type { ReactElement } from "react";

import { DesktopUpdateDialog } from "@/components/desktop-update-dialog";
import { UpdateAvailableDialog } from "@/components/update-available-dialog";
import { useDesktop } from "@/desktop/use-desktop";
import { useDesktopUpdateStatus } from "@/desktop/use-desktop-update-status";
import { useDesktopUpdatePrompt } from "@/hooks/use-desktop-update-prompt";
import { useUpdateNotification } from "@/hooks/use-update-notification";

/**
 * Routes update prompts to whichever mechanism actually applies here.
 *
 * The two are mutually exclusive by design. Inside the desktop shell the
 * runtime's npm-based update path is meaningless — the packaged app runs a
 * bundled CLI, so `npm i -g kanban` would update something the user isn't
 * running — and polling for it would surface a prompt whose instructions
 * cannot work. So the shell's updater wins outright when it is available,
 * and the runtime poll is switched off rather than merely hidden.
 */
export function UpdateNotificationController(): ReactElement | null {
	const desktop = useDesktop();
	const desktopUpdatesAvailable = desktop?.has("updates") ?? false;

	const desktopStatus = useDesktopUpdateStatus();
	const { dismissed: desktopDismissed, dismiss: dismissDesktop } = useDesktopUpdatePrompt(desktopStatus);

	const { availableUpdate, dismiss } = useUpdateNotification({
		enabled: !desktopUpdatesAvailable,
	});

	if (desktopUpdatesAvailable) {
		if (desktopStatus.kind !== "ready" || desktopDismissed) {
			return null;
		}
		return (
			<DesktopUpdateDialog
				open
				currentVersion={desktop?.appVersion ?? "unknown"}
				latestVersion={desktopStatus.version}
				onInstall={() => desktop?.updates.install()}
				onClose={dismissDesktop}
			/>
		);
	}

	if (!availableUpdate) {
		return null;
	}

	return (
		<UpdateAvailableDialog
			open
			currentVersion={availableUpdate.currentVersion}
			latestVersion={availableUpdate.latestVersion}
			installCommand={availableUpdate.installCommand}
			onClose={dismiss}
		/>
	);
}
