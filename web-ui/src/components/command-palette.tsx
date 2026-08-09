import { Fzf } from "fzf";
import { Search } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type AppAction, formatAccelerator } from "@/actions/app-actions";
import { renderFuzzyHighlightedText } from "@/components/shared/render-fuzzy-highlighted-text";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { isMacPlatform } from "@/utils/platform";

interface CommandPaletteProps {
	open: boolean;
	actions: readonly AppAction[];
	onClose: () => void;
}

const MATCH_STYLE = { color: "var(--color-accent)", fontWeight: 600 } as const;

interface PaletteEntry {
	action: AppAction;
	positions?: Set<number>;
}

export function CommandPalette({ open, actions, onClose }: CommandPaletteProps): ReactElement {
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Search the label together with its group, so "view terminal" finds
	// "Toggle Terminal" without the user knowing the exact wording.
	const finder = useMemo(
		() => new Fzf([...actions], { selector: (action) => `${action.group} ${action.label}` }),
		[actions],
	);

	const entries = useMemo<PaletteEntry[]>(() => {
		const trimmed = query.trim();
		if (!trimmed) {
			return actions.map((action) => ({ action }));
		}
		return finder.find(trimmed).map((result) => ({
			action: result.item,
			// fzf reports positions against the selector string, which is
			// prefixed with the group; shift them back onto the label.
			positions: shiftPositions(result.positions, result.item.group.length + 1),
		}));
	}, [actions, finder, query]);

	// A stale index after filtering would highlight the wrong row, or none.
	useEffect(() => {
		setActiveIndex(0);
	}, [query]);

	useEffect(() => {
		if (!open) {
			setQuery("");
			setActiveIndex(0);
			return;
		}
		// Radix moves focus to the dialog itself; steal it for the input so
		// the palette is usable without a second keystroke.
		const timer = setTimeout(() => inputRef.current?.focus(), 0);
		return () => clearTimeout(timer);
	}, [open]);

	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	const runEntry = (entry: PaletteEntry | undefined): void => {
		if (!entry || !entry.action.enabled) return;
		onClose();
		entry.action.run();
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((current) => (entries.length === 0 ? 0 : (current + 1) % entries.length));
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((current) => (entries.length === 0 ? 0 : (current - 1 + entries.length) % entries.length));
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			runEntry(entries[activeIndex]);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<div className="flex items-center gap-2 border-b border-border px-4 py-3">
				<Search size={16} className="shrink-0 text-text-tertiary" />
				<input
					ref={inputRef}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Search commands…"
					aria-label="Search commands"
					className="w-full bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-tertiary"
				/>
			</div>
			<div ref={listRef} className="max-h-80 overflow-y-auto py-1">
				{entries.length === 0 ? (
					<p className="px-4 py-6 text-center text-[13px] text-text-tertiary">No matching commands</p>
				) : (
					entries.map((entry, index) => (
						<button
							key={entry.action.id}
							type="button"
							data-index={index}
							disabled={!entry.action.enabled}
							onMouseEnter={() => setActiveIndex(index)}
							onClick={() => runEntry(entry)}
							className={cn(
								"flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px]",
								entry.action.enabled ? "cursor-pointer text-text-primary" : "cursor-default text-text-tertiary",
								index === activeIndex && entry.action.enabled && "bg-surface-3",
							)}
						>
							<span className="flex min-w-0 items-center gap-2">
								<span className="shrink-0 text-text-tertiary">{entry.action.group}</span>
								<span className="text-text-tertiary">›</span>
								<span className="truncate">
									{renderFuzzyHighlightedText(entry.action.label, entry.positions, MATCH_STYLE)}
								</span>
							</span>
							{entry.action.accelerator ? (
								<span className="shrink-0 font-mono text-[11px] text-text-tertiary">
									{formatAccelerator(entry.action.accelerator, isMacPlatform)}
								</span>
							) : null}
						</button>
					))
				)}
			</div>
		</Dialog>
	);
}

/**
 * Move fuzzy-match positions from the `"<group> <label>"` search string back
 * onto the label alone, dropping any that landed in the group prefix.
 *
 * Exported only for tests — internal helper.
 */
export function shiftPositions(positions: Set<number>, offset: number): Set<number> {
	const shifted = new Set<number>();
	for (const position of positions) {
		if (position >= offset) shifted.add(position - offset);
	}
	return shifted;
}
