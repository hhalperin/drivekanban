import type { DesktopUpdateStatus } from "@desktop-bridge";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDesktopUpdatePrompt } from "./use-desktop-update-prompt";

interface UseDesktopUpdatePromptResult {
	dismissed: boolean;
	dismiss: () => void;
}

const READY_1: DesktopUpdateStatus = { kind: "ready", version: "1.0.0" };
const READY_2: DesktopUpdateStatus = { kind: "ready", version: "2.0.0" };

describe("useDesktopUpdatePrompt", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
			.IS_REACT_ACT_ENVIRONMENT;
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
			return;
		}
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
	});

	function renderPrompt(initialStatus: DesktopUpdateStatus): {
		getState: () => UseDesktopUpdatePromptResult;
		setStatus: (next: DesktopUpdateStatus) => void;
	} {
		let hookResult: UseDesktopUpdatePromptResult | null = null;

		function HookHarness({ status }: { status: DesktopUpdateStatus }): null {
			hookResult = useDesktopUpdatePrompt(status);
			return null;
		}

		const render = (status: DesktopUpdateStatus): void => {
			act(() => {
				root.render(<HookHarness status={status} />);
			});
		};

		render(initialStatus);

		return {
			getState: () => {
				if (!hookResult) throw new Error("Hook did not render");
				return hookResult;
			},
			setStatus: render,
		};
	}

	it("starts undismissed", () => {
		const { getState } = renderPrompt(READY_1);

		expect(getState().dismissed).toBe(false);
	});

	it("dismisses the current version", () => {
		const { getState } = renderPrompt(READY_1);

		act(() => {
			getState().dismiss();
		});

		expect(getState().dismissed).toBe(true);
	});

	it("re-prompts when a newer update becomes ready", () => {
		// Dismissal answers for one update, not for updates in general. On a
		// machine left running for days, a session-wide dismissal would
		// suppress every subsequent update until the app restarted.
		const { getState, setStatus } = renderPrompt(READY_1);

		act(() => {
			getState().dismiss();
		});
		expect(getState().dismissed).toBe(true);

		setStatus(READY_2);

		expect(getState().dismissed).toBe(false);
	});

	it("stays dismissed while the same version is still ready", () => {
		const { getState, setStatus } = renderPrompt(READY_1);

		act(() => {
			getState().dismiss();
		});
		setStatus({ kind: "ready", version: "1.0.0" });

		expect(getState().dismissed).toBe(true);
	});

	it("reports undismissed for non-ready statuses", () => {
		// Nothing is being prompted, so nothing can be dismissed — the caller
		// gates on the status itself.
		const { getState } = renderPrompt({ kind: "downloading", version: "1.0.0", percent: 40 });

		expect(getState().dismissed).toBe(false);
	});

	it("dismissing outside a ready state does not suppress the next prompt", () => {
		const { getState, setStatus } = renderPrompt({ kind: "checking" });

		act(() => {
			getState().dismiss();
		});
		setStatus(READY_1);

		expect(getState().dismissed).toBe(false);
	});
});
