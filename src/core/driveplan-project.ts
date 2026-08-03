/**
 * DrivePlan → Kanban projection host (ADR-0018 §7).
 * Mirrors @cline/drive applyProjection card shape without taking a package dep.
 */

import type { RuntimeBoardColumnId, RuntimeBoardData } from "./api-contract";
import { isDriveplanManagedCard } from "./api-contract";
import { addTaskToColumn } from "./task-board-mutations";

export type DriveRunWorkItemProjection = {
	id: string;
	objective: string;
	isolation: string;
	writeClaims: string[];
	status: "PENDING" | "RUNNING" | "FAILED" | "SUCCESS" | "AWAITING_REVIEW";
};

export type DriveRunProjection = {
	id: string;
	driveTaskId: string;
	spec: {
		workItems: DriveRunWorkItemProjection[];
	};
};

export type ProjectedKanbanCard = {
	title: string;
	prompt: string;
	startInPlanMode: boolean;
	autoReviewEnabled: false;
	externalRef: {
		system: "driveplan";
		driveTaskId: string;
		driveRunId: string;
		workItemId?: string;
	};
	columnHint: RuntimeBoardColumnId;
};

function columnForStatus(
	status: DriveRunWorkItemProjection["status"],
): ProjectedKanbanCard["columnHint"] {
	switch (status) {
		case "PENDING":
			return "backlog";
		case "RUNNING":
		case "FAILED":
			return "in_progress";
		case "SUCCESS":
		case "AWAITING_REVIEW":
			return "review";
		default: {
			const _exhaustive: never = status;
			return _exhaustive;
		}
	}
}

/** Same card descriptors as @cline/drive applyProjection. */
export function applyProjectionLocal(run: DriveRunProjection): {
	driveTaskId: string;
	driveRunId: string;
	cards: ProjectedKanbanCard[];
} {
	const cards: ProjectedKanbanCard[] = run.spec.workItems.map((item) => ({
		title: `${item.id} · ${item.objective}`,
		prompt: [
			`DriveTask: ${run.driveTaskId}`,
			`DriveRun: ${run.id}`,
			`WorkItem: ${item.id}`,
			"",
			item.objective,
			"",
			`Isolation: ${item.isolation}`,
			item.writeClaims.length
				? `Write claims: ${item.writeClaims.join(", ")}`
				: "Write claims: none",
		].join("\n"),
		startInPlanMode: true,
		autoReviewEnabled: false,
		externalRef: {
			system: "driveplan",
			driveTaskId: run.driveTaskId,
			driveRunId: run.id,
			workItemId: item.id,
		},
		columnHint: columnForStatus(item.status),
	}));
	return {
		driveTaskId: run.driveTaskId,
		driveRunId: run.id,
		cards,
	};
}

export type ProjectDriveRunToBoardResult = {
	board: RuntimeBoardData;
	created: Array<{ columnId: RuntimeBoardColumnId; taskId: string }>;
};

/**
 * Apply a DriveRun projection onto a board (one card per work item).
 * Skips cards whose externalRef already exists on the board.
 */
export function projectDriveRunToBoard(
	board: RuntimeBoardData,
	run: DriveRunProjection,
	baseRef: string,
	randomUuid: () => string,
	now: number = Date.now(),
): ProjectDriveRunToBoardResult {
	const projection = applyProjectionLocal(run);
	const existingRefs = new Set<string>();
	for (const column of board.columns) {
		for (const card of column.cards) {
			if (!isDriveplanManagedCard(card) || !card.externalRef) {
				continue;
			}
			const key = [
				card.externalRef.driveTaskId,
				card.externalRef.driveRunId,
				card.externalRef.workItemId ?? "",
			].join(":");
			existingRefs.add(key);
		}
	}

	let next = board;
	const created: ProjectDriveRunToBoardResult["created"] = [];

	for (const card of projection.cards) {
		const key = [
			card.externalRef.driveTaskId,
			card.externalRef.driveRunId,
			card.externalRef.workItemId ?? "",
		].join(":");
		if (existingRefs.has(key)) {
			continue;
		}
		const columnId =
			card.columnHint === "trash" ? "backlog" : card.columnHint;
		const result = addTaskToColumn(
			next,
			columnId,
			{
				title: card.title,
				prompt: card.prompt,
				startInPlanMode: card.startInPlanMode,
				autoReviewEnabled: true, // forced false by managed ref
				baseRef,
				externalRef: card.externalRef,
			},
			randomUuid,
			now,
		);
		next = result.board;
		created.push({ columnId, taskId: result.task.id });
		existingRefs.add(key);
	}

	return { board: next, created };
}
