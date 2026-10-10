import { describe, expect, it, vi } from "vitest";

// JSX-in-.js component pulled in through the import chain; mock to keep the
// unit-test transform simple (see tests/unit/confirm.test.js).
// fileSystem pulls cordova/browser-only modules into the graph; not needed
// for pure helper assertions.
vi.mock("fileSystem", () => ({
	default: {},
}));
vi.mock("components/checkbox", () => ({
	default: () => ({}),
}));
vi.mock("lib/restoreTheme", () => ({ default: () => {} }));

import { toGitStat } from "lib/git/gitClient";

describe("toGitStat", () => {
	it("maps directory stats", () => {
		const stat = toGitStat({ type: "dir", modifiedDate: "2026-01-01T00:00:00Z" });
		expect(stat.isDirectory()).toBe(true);
		expect(stat.isFile()).toBe(false);
		expect(stat.mode).toBe(0o40000);
	});

	it("maps file stats", () => {
		const stat = toGitStat({
			type: "file",
			size: 42,
			modifiedDate: "2026-01-01T00:00:00Z",
		});
		expect(stat.isFile()).toBe(true);
		expect(stat.isDirectory()).toBe(false);
		expect(stat.size).toBe(42);
		expect(stat.mode).toBe(0o100644);
	});

	it("handles isDirectory flag from stats", () => {
		const stat = toGitStat({ isDirectory: true });
		expect(stat.isDirectory()).toBe(true);
	});
});
