/**
 * Bounded, in-memory capture of the runtime child's output.
 *
 * The shell previously drained the child's stdout into a no-op and kept only
 * an 8 KB stderr tail for crash messages, which meant that in a packaged app
 * — where there is no terminal to read — every user-reported startup failure
 * was unreproducible. This keeps enough recent output to diagnose one.
 *
 * Deliberately a ring buffer with a hard line cap: a chatty runtime left
 * running for days would otherwise grow this without limit, and the oldest
 * lines are the least useful for diagnosing what just went wrong.
 */

export type RuntimeLogStream = "stdout" | "stderr";

export interface RuntimeLogLine {
	stream: RuntimeLogStream;
	text: string;
}

export const DEFAULT_MAX_LINES = 2_000;

/**
 * A single line longer than this is truncated. Runtimes occasionally emit a
 * megabyte-long serialised payload on one line, and one of those would
 * otherwise evict the entire useful history by itself.
 */
const MAX_LINE_LENGTH = 4_000;

export class RuntimeLogBuffer {
	private readonly lines: RuntimeLogLine[] = [];
	/** Carries an incomplete trailing line between chunks, per stream. */
	private readonly partial: Record<RuntimeLogStream, string> = {
		stdout: "",
		stderr: "",
	};
	private readonly listeners = new Set<(line: RuntimeLogLine) => void>();

	constructor(private readonly maxLines: number = DEFAULT_MAX_LINES) {}

	/**
	 * Feed a raw chunk. Chunks arrive on pipe boundaries, not line boundaries,
	 * so a line is held back until its newline shows up — otherwise a single
	 * log line routinely appears split across two entries.
	 */
	append(stream: RuntimeLogStream, chunk: string): void {
		const combined = this.partial[stream] + chunk;
		const segments = combined.split(/\r?\n/);
		// The last segment has no terminating newline yet.
		this.partial[stream] = segments.pop() ?? "";

		for (const segment of segments) {
			this.push({ stream, text: truncate(segment) });
		}

		// Guard against a runtime that never emits a newline: flush once the
		// pending fragment is itself line-length, or it would buffer forever.
		if (this.partial[stream].length >= MAX_LINE_LENGTH) {
			this.push({ stream, text: truncate(this.partial[stream]) });
			this.partial[stream] = "";
		}
	}

	/** Emit any buffered partial lines. Called when the child exits. */
	flush(): void {
		for (const stream of ["stdout", "stderr"] as const) {
			const pending = this.partial[stream];
			if (pending.length > 0) {
				this.partial[stream] = "";
				this.push({ stream, text: truncate(pending) });
			}
		}
	}

	getLines(): RuntimeLogLine[] {
		return [...this.lines];
	}

	get size(): number {
		return this.lines.length;
	}

	clear(): void {
		this.lines.length = 0;
		this.partial.stdout = "";
		this.partial.stderr = "";
	}

	subscribe(listener: (line: RuntimeLogLine) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private push(line: RuntimeLogLine): void {
		this.lines.push(line);
		if (this.lines.length > this.maxLines) {
			this.lines.splice(0, this.lines.length - this.maxLines);
		}
		for (const listener of this.listeners) {
			try {
				listener(line);
			} catch (err) {
				// A destroyed log window's webContents throws on send; one dead
				// listener must not stop the buffer from accepting more output.
				console.warn(
					"[desktop] Runtime log listener threw:",
					err instanceof Error ? err.message : err,
				);
			}
		}
	}
}

function truncate(text: string): string {
	return text.length > MAX_LINE_LENGTH ? `${text.slice(0, MAX_LINE_LENGTH)}…` : text;
}
