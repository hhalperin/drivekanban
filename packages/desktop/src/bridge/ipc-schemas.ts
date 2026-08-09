/**
 * Payload schemas for every `window.desktop` IPC channel.
 *
 * The renderer is same-origin-guarded and the runtime is health-checked for
 * a `<title>Kanban</title>` body before we ever attach, but neither of those
 * makes the renderer *trusted*: it runs remote-loaded code, and IPC is the
 * one path from there into the main process. Every inbound payload is parsed
 * here before a handler sees it, so a malformed or hostile message is
 * rejected at the boundary instead of reaching Electron APIs.
 */

import { z } from "zod";

export const openProjectWindowPayloadSchema = z.object({
	projectId: z.string().trim().min(1),
});

export type OpenProjectWindowPayload = z.infer<
	typeof openProjectWindowPayloadSchema
>;

/**
 * Notification text is bounded so a runaway renderer can't push megabyte
 * strings into the OS notification centre. The limits are generous next to
 * what any platform actually renders — macOS and Windows both truncate far
 * sooner — so clamping here costs nothing a user would see.
 */
export const notifyPayloadSchema = z
	.object({
		key: z.string().trim().min(1).max(200),
		title: z.string().trim().min(1).max(200),
		body: z.string().max(1_000),
		projectId: z.string().trim().min(1).optional(),
		taskId: z.string().trim().min(1).optional(),
	})
	// A task id without its project can't be turned into a URL — the web UI
	// addresses tasks as `/<projectId>?task=<id>` — so reject the pair rather
	// than shipping a notification whose click does nothing.
	.refine((value) => (value.taskId ? Boolean(value.projectId) : true), {
		message: "taskId requires projectId",
	});

export type NotifyPayload = z.infer<typeof notifyPayloadSchema>;

/**
 * Counts are clamped rather than merely validated. A renderer bug producing a
 * huge number would otherwise reach `app.setBadgeCount`, and there is no
 * sensible reading of "9 million tasks ready".
 */
const presenceCount = z.number().int().min(0).max(9_999).catch(0);

export const presenceCountsPayloadSchema = z.object({
	running: presenceCount,
	readyForReview: presenceCount,
});

export type PresenceCountsPayload = z.infer<typeof presenceCountsPayloadSchema>;

/**
 * Menu contents are bounded: the menu is rebuilt on every publish, and an
 * unbounded list would let a renderer bug stall the UI thread building
 * thousands of native menu items.
 */
export const menuActionsPayloadSchema = z
	.array(
		z.object({
			id: z.string().trim().min(1).max(100),
			label: z.string().trim().min(1).max(120),
			group: z.string().trim().min(1).max(60),
			accelerator: z.string().trim().min(1).max(60).nullable().catch(null),
			enabled: z.boolean().catch(false),
		}),
	)
	.max(100);

export type MenuActionsPayload = z.infer<typeof menuActionsPayloadSchema>;

/**
 * Shared by every channel that takes no arguments. Modelled explicitly
 * rather than skipping validation, so a payload-less channel that later
 * grows a payload can't silently start accepting unvalidated input.
 */
export const emptyPayloadSchema = z.undefined();
