import { useCallback } from "react";

import { getBrowserNotificationPermission } from "@/utils/notification-permission";

import { useDesktop } from "./use-desktop";

export interface ReviewReadyNotification {
	/**
	 * Per-occurrence identity, not per-task. The shell dedupes on this, so a
	 * task that becomes ready, gets reviewed, and becomes ready again must
	 * produce a different key or the second notification is silently dropped.
	 */
	eventKey: string;
	taskId: string;
	projectId: string | null;
	title: string;
	body: string;
}

export type ReviewReadyNotifier = (notification: ReviewReadyNotification) => void;

function showBrowserNotification(notification: ReviewReadyNotification): void {
	if (getBrowserNotificationPermission() !== "granted") {
		return;
	}
	try {
		const browserNotification = new Notification(notification.title, {
			body: notification.body,
			tag: `task-ready-for-review-${notification.taskId}`,
			icon: "/assets/icon-notification.png",
		});
		browserNotification.onclick = () => {
			if (typeof window !== "undefined") {
				window.focus();
			}
			browserNotification.close();
		};
	} catch {
		// Ignore browser notification failures.
	}
}

/**
 * Posts "ready for review" notifications through the best available transport.
 *
 * In the desktop shell that is the OS notification centre: no permission
 * prompt, delivery while the app is unfocused, and a click that opens the
 * specific task rather than merely focusing the window. In a browser it stays
 * on the web Notification API, which needs granted permission and can only
 * focus the tab.
 */
export function useReviewReadyNotifier(): ReviewReadyNotifier {
	const desktop = useDesktop();
	const hasShellNotifications = desktop?.has("notifications") ?? false;

	return useCallback(
		(notification: ReviewReadyNotification) => {
			if (!hasShellNotifications || !desktop) {
				showBrowserNotification(notification);
				return;
			}
			desktop.notifications.notify({
				key: notification.eventKey,
				title: notification.title,
				body: notification.body,
				// Both or neither: the shell rejects a task without its project,
				// since it cannot build a URL for one.
				...(notification.projectId ? { projectId: notification.projectId, taskId: notification.taskId } : {}),
			});
		},
		[desktop, hasShellNotifications],
	);
}
