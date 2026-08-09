import { ArrowUpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";

interface DesktopUpdateDialogProps {
	open: boolean;
	currentVersion: string;
	latestVersion: string;
	onInstall: () => void;
	onClose: () => void;
}

/**
 * Shown when the Electron shell has already downloaded an update and only
 * needs a restart.
 *
 * Deliberately not the browser `UpdateAvailableDialog`: that one hands the
 * user an npm command, which does nothing to a packaged desktop app — it
 * updates a CLI the bundle doesn't run from. Here the update is on disk and
 * the only action is restarting.
 */
export function DesktopUpdateDialog({
	open,
	currentVersion,
	latestVersion,
	onInstall,
	onClose,
}: DesktopUpdateDialogProps): React.ReactElement {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					onClose();
				}
			}}
		>
			<DialogHeader
				title="Update ready to install"
				icon={<ArrowUpCircle size={16} className="text-status-blue" />}
			/>
			<DialogBody className="flex flex-col gap-3 text-[13px] text-text-secondary">
				<p>
					<span className="font-semibold text-text-primary">Kanban {latestVersion}</span> has been downloaded and
					will be installed when you restart. You are currently on version {currentVersion}.
				</p>
				<p>
					Restarting closes every Kanban window and stops running agent sessions, so finish or pause anything in
					flight first.
				</p>
			</DialogBody>
			<DialogFooter>
				<Button variant="default" onClick={onClose}>
					Later
				</Button>
				<Button variant="primary" onClick={onInstall}>
					Restart and Install
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
