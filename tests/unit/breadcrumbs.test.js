import { describe, expect, it } from "vitest";
import { buildCrumbs } from "lib/breadcrumbs";

describe("buildCrumbs", () => {
	it("returns single filename when no root dir", () => {
		expect(buildCrumbs("content://x/app.js", null)).toEqual(["app.js"]);
	});

	it("splits path relative to root dir", () => {
		const root = "content://storage/projects/myapp";
		const uri = root + "/src/lib/main.js";
		expect(buildCrumbs(uri, root)).toEqual(["src", "lib", "main.js"]);
	});

	it("handles trailing slash in root", () => {
		const root = "content://storage/projects/myapp/";
		const uri = "content://storage/projects/myapp/index.html";
		expect(buildCrumbs(uri, root)).toEqual(["index.html"]);
	});

	it("falls back to filename when uri is outside root", () => {
		const root = "content://storage/projects/myapp";
		expect(buildCrumbs("content://other/main.js", root)).toEqual(["main.js"]);
	});

	it("returns empty for empty uri", () => {
		expect(buildCrumbs("", "content://root")).toEqual([]);
	});
});
