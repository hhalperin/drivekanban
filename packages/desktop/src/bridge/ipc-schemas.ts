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
 * Restart carries no arguments. Modelled explicitly (rather than skipping
 * validation) so a payload-less channel that later grows a payload can't
 * silently start accepting unvalidated input.
 */
export const restartRuntimePayloadSchema = z.undefined();
