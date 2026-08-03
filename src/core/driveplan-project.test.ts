import { describe, expect, it } from "vitest";
import { isDriveplanManagedCard } from "./api-contract";
import { projectDriveRunToBoard } from "./driveplan-project";
import type { RuntimeBoardData } from "./api-contract";

function emptyBoard(): RuntimeBoardData {
	return {
		columns: [
			{ id: "backlog", title: "Backlog", cards: [] },
			{ id: "in_progress", title: "In Progress", cards: [] },
			{ id: "review", title: "Review", cards: [] },
			{ id: "trash", title: "Trash", cards: [] },
		],
		dependencies: [],
	};
}

describe("projectDriveRunToBoard", () => {
	it("creates managed cards with autoReviewEnabled false", () => {
		const result = projectDriveRunToBoard(
			emptyBoard(),
			{
				id: "run_1",
				driveTaskId: "task_1",
				spec: {
					workItems: [
						{
							id: "wi_a",
							objective: "Patch retry",
							isolation: "worktree",
							writeClaims: ["src/a.ts"],
							status: "PENDING",
						},
						{
							id: "wi_b",
							objective: "Run tests",
							isolation: "shared",
							writeClaims: [],
							status: "RUNNING",
						},
					],
				},
			},
			"main",
			() => "uuid-1",
			100,
		);

		expect(result.created).toHaveLength(2);
		const backlog = result.board.columns.find((c) => c.id === "backlog");
		const inProgress = result.board.columns.find((c) => c.id === "in_progress");
		expect(backlog?.cards).toHaveLength(1);
		expect(inProgress?.cards).toHaveLength(1);
		const managed = backlog!.cards[0]!;
		expect(isDriveplanManagedCard(managed)).toBe(true);
		expect(managed.autoReviewEnabled).toBe(false);
		expect(managed.externalRef?.workItemId).toBe("wi_a");
	});

	it("is idempotent for the same externalRef", () => {
		const first = projectDriveRunToBoard(
			emptyBoard(),
			{
				id: "run_1",
				driveTaskId: "task_1",
				spec: {
					workItems: [
						{
							id: "wi_a",
							objective: "Patch",
							isolation: "worktree",
							writeClaims: [],
							status: "PENDING",
						},
					],
				},
			},
			"main",
			() => "uuid-1",
			100,
		);
		const second = projectDriveRunToBoard(
			first.board,
			{
				id: "run_1",
				driveTaskId: "task_1",
				spec: {
					workItems: [
						{
							id: "wi_a",
							objective: "Patch",
							isolation: "worktree",
							writeClaims: [],
							status: "PENDING",
						},
					],
				},
			},
			"main",
			() => "uuid-2",
			200,
		);
		expect(second.created).toHaveLength(0);
		expect(second.board.columns.find((c) => c.id === "backlog")?.cards).toHaveLength(1);
	});
});
