import { useHotkeys } from "react-hotkeys-hook";

import { APP_ACTION_ACCELERATORS, AppActionId } from "@/actions/app-actions";
import type { CardSelection } from "@/types";

function isEventInsideDialog(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest("[role='dialog']") !== null;
}

interface UseAppHotkeysInput {
	selectedCard: CardSelection | null;
	isDetailTerminalOpen: boolean;
	isHomeTerminalOpen: boolean;
	isHomeGitHistoryOpen: boolean;
	canUseCreateTaskShortcut: boolean;
	handleToggleDetailTerminal: () => void;
	handleToggleHomeTerminal: () => void;
	handleToggleExpandDetailTerminal: () => void;
	handleToggleExpandHomeTerminal: () => void;
	handleOpenCreateTask: () => void;
	handleOpenSettings: () => void;
	handleToggleGitHistory: () => void;
	handleCloseGitHistory: () => void;
	onStartAllTasks: () => void;
}

export function useAppHotkeys({
	selectedCard,
	isDetailTerminalOpen,
	isHomeTerminalOpen,
	isHomeGitHistoryOpen,
	canUseCreateTaskShortcut,
	handleToggleDetailTerminal,
	handleToggleHomeTerminal,
	handleToggleExpandDetailTerminal,
	handleToggleExpandHomeTerminal,
	handleOpenCreateTask,
	handleOpenSettings,
	handleToggleGitHistory,
	handleCloseGitHistory,
	onStartAllTasks,
}: UseAppHotkeysInput): void {
	useHotkeys(
		APP_ACTION_ACCELERATORS[AppActionId.ToggleTerminal],
		() => {
			if (selectedCard) {
				handleToggleDetailTerminal();
				return;
			}
			handleToggleHomeTerminal();
		},
		{
			enableOnFormTags: true,
			enableOnContentEditable: true,
			preventDefault: true,
		},
		[handleToggleDetailTerminal, handleToggleHomeTerminal, selectedCard],
	);

	useHotkeys(
		APP_ACTION_ACCELERATORS[AppActionId.StartAllTasks],
		onStartAllTasks,
		{
			enableOnContentEditable: false,
			enableOnFormTags: false,
			preventDefault: true,
		},
		[onStartAllTasks],
	);

	useHotkeys(
		APP_ACTION_ACCELERATORS[AppActionId.ToggleTerminalExpanded],
		() => {
			if (selectedCard) {
				if (isDetailTerminalOpen) {
					handleToggleExpandDetailTerminal();
				}
				return;
			}
			if (isHomeTerminalOpen) {
				handleToggleExpandHomeTerminal();
			}
		},
		{
			enableOnFormTags: true,
			enableOnContentEditable: true,
			preventDefault: true,
		},
		[
			handleToggleExpandDetailTerminal,
			handleToggleExpandHomeTerminal,
			isDetailTerminalOpen,
			isHomeTerminalOpen,
			selectedCard,
		],
	);

	useHotkeys(
		APP_ACTION_ACCELERATORS[AppActionId.CreateTask],
		() => {
			if (!canUseCreateTaskShortcut) {
				return;
			}
			handleOpenCreateTask();
		},
		{ preventDefault: true },
		[canUseCreateTaskShortcut, handleOpenCreateTask],
	);

	useHotkeys(
		APP_ACTION_ACCELERATORS[AppActionId.ToggleGitHistory],
		() => {
			handleToggleGitHistory();
		},
		{
			enableOnFormTags: true,
			enableOnContentEditable: true,
			preventDefault: true,
		},
		[handleToggleGitHistory],
	);

	useHotkeys(
		APP_ACTION_ACCELERATORS[AppActionId.OpenSettings],
		() => {
			handleOpenSettings();
		},
		{
			enableOnFormTags: true,
			enableOnContentEditable: true,
			preventDefault: true,
		},
		[handleOpenSettings],
	);

	useHotkeys(
		"escape",
		(event) => {
			if (selectedCard || !isHomeGitHistoryOpen || isEventInsideDialog(event.target)) {
				return;
			}
			event.preventDefault();
			handleCloseGitHistory();
		},
		{
			enableOnFormTags: true,
			enableOnContentEditable: true,
			preventDefault: true,
		},
		[handleCloseGitHistory, isHomeGitHistoryOpen, selectedCard],
	);
}
