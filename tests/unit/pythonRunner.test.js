import { describe, expect, it } from "vitest";
import { isPythonFile, getPyodideScriptUrl, PYODIDE_VERSION } from "lib/pythonRunner";

describe("pythonRunner helpers", () => {
	it("detects python files", () => {
		expect(isPythonFile("main.py")).toBe(true);
		expect(isPythonFile("SCRIPT.PY")).toBe(true);
		expect(isPythonFile("main.js")).toBe(false);
		expect(isPythonFile(null)).toBe(false);
	});

	it("builds the pyodide bootstrap url", () => {
		expect(getPyodideScriptUrl()).toBe(
			"https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/pyodide.js",
		);
		expect(PYODIDE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
