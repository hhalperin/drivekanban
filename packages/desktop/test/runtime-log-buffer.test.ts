import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatLogsForClipboard } from "../src/logs/log-window.js";
import { RuntimeLogBuffer } from "../src/logs/runtime-log-buffer.js";

let buffer: RuntimeLogBuffer;

beforeEach(() => {
	buffer = new RuntimeLogBuffer(5);
});

describe("line assembly", () => {
	it("splits a chunk into lines", () => {
		buffer.append("stdout", "one\ntwo\nthree\n");

		expect(buffer.getLines().map((line) => line.text)).toEqual(["one", "two", "three"]);
	});

	it("holds back an unterminated line until its newline arrives", () => {
		// Chunks land on pipe boundaries, not line boundaries. Emitting the
		// fragment immediately would split routine log lines across entries.
		buffer.append("stdout", "hello ");
		expect(buffer.getLines()).toEqual([]);

		buffer.append("stdout", "world\n");
		expect(buffer.getLines().map((line) => line.text)).toEqual(["hello world"]);
	});

	it("keeps the two streams' partial lines apart", () => {
		buffer.append("stdout", "out-frag ");
		buffer.append("stderr", "err-line\n");
		buffer.append("stdout", "done\n");

		expect(buffer.getLines()).toEqual([
			{ stream: "stderr", text: "err-line" },
			{ stream: "stdout", text: "out-frag done" },
		]);
	});

	it("handles CRLF", () => {
		buffer.append("stdout", "one\r\ntwo\r\n");

		expect(buffer.getLines().map((line) => line.text)).toEqual(["one", "two"]);
	});

	it("flushes a trailing fragment on exit", () => {
		// A child that dies mid-line still has its last words worth reading —
		// often the most important ones.
		buffer.append("stderr", "fatal: could not bind port");
		buffer.flush();

		expect(buffer.getLines()).toEqual([
			{ stream: "stderr", text: "fatal: could not bind port" },
		]);
	});

	it("is a no-op to flush twice", () => {
		buffer.append("stdout", "tail");
		buffer.flush();
		buffer.flush();

		expect(buffer.getLines()).toHaveLength(1);
	});
});

describe("bounds", () => {
	it("evicts the oldest lines past the cap", () => {
		for (let i = 1; i <= 8; i += 1) buffer.append("stdout", `line ${i}\n`);

		expect(buffer.getLines().map((line) => line.text)).toEqual([
			"line 4",
			"line 5",
			"line 6",
			"line 7",
			"line 8",
		]);
	});

	it("truncates an absurdly long line", () => {
		// One megabyte-long serialised payload would otherwise evict the whole
		// useful history by itself.
		buffer.append("stdout", `${"x".repeat(10_000)}\n`);

		const text = buffer.getLines()[0]?.text ?? "";
		expect(text.length).toBeLessThan(10_000);
		expect(text.endsWith("…")).toBe(true);
	});

	it("flushes a pending fragment that never gets a newline", () => {
		// A runtime emitting an endless unterminated line must not buffer
		// forever.
		buffer.append("stdout", "y".repeat(10_000));

		expect(buffer.size).toBeGreaterThan(0);
	});
});

describe("subscribers", () => {
	it("receives each completed line", () => {
		const seen: string[] = [];
		buffer.subscribe((line) => seen.push(line.text));

		buffer.append("stdout", "a\nb\n");

		expect(seen).toEqual(["a", "b"]);
	});

	it("stops after unsubscribe", () => {
		const listener = vi.fn();
		const unsubscribe = buffer.subscribe(listener);

		unsubscribe();
		buffer.append("stdout", "a\n");

		expect(listener).not.toHaveBeenCalled();
	});

	it("keeps serving the others when one throws", () => {
		// A destroyed log window's webContents throws on send.
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const healthy = vi.fn();
		buffer.subscribe(() => {
			throw new Error("window destroyed");
		});
		buffer.subscribe(healthy);

		buffer.append("stdout", "a\n");

		expect(healthy).toHaveBeenCalledOnce();
		vi.restoreAllMocks();
	});
});

describe("clear", () => {
	it("drops lines and pending fragments", () => {
		buffer.append("stdout", "kept\nfragment");
		buffer.clear();
		buffer.flush();

		expect(buffer.getLines()).toEqual([]);
	});
});

describe("formatLogsForClipboard", () => {
	it("marks stderr lines and leaves stdout bare", () => {
		expect(
			formatLogsForClipboard([
				{ stream: "stdout", text: "starting" },
				{ stream: "stderr", text: "port in use" },
			]),
		).toBe("starting\n[stderr] port in use");
	});

	it("renders an empty log as an empty string", () => {
		expect(formatLogsForClipboard([])).toBe("");
	});
});
