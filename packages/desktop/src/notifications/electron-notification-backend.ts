/**
 * The only module that touches Electron's `Notification`.
 *
 * Mirrors the updater's adapter split: the controller holds the policy, this
 * holds the Electron call, so a change in either lands in one place.
 */

import { Notification } from "electron";

import type {
	NotificationBackend,
	NotificationHandle,
} from "./notification-controller.js";

export function createElectronNotificationBackend(): NotificationBackend {
	return {
		isSupported(): boolean {
			// False on a Linux box with no notification daemon, and on Windows
			// where the app isn't registered for toasts. Checked per call
			// rather than cached: a daemon can start after the app does.
			return Notification.isSupported();
		},

		create({ title, body }): NotificationHandle {
			const notification = new Notification({ title, body });
			return {
				show: () => notification.show(),
				onClick: (listener) => {
					notification.on("click", listener);
				},
			};
		},
	};
}
