/**
 * Python runner powered by Pyodide (WASM) loaded on demand from CDN.
 * Runs the active file's code and streams stdout/stderr to the app console.
 *
 * Pure helpers are exported for unit tests.
 */

import { getDocText } from "cm/editorUtils";

export const PYODIDE_VERSION = "0.26.4";
export const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * Builds the <script> URL used to bootstrap Pyodide.
 * @returns {string}
 */
export function getPyodideScriptUrl() {
	return `${PYODIDE_CDN}pyodide.js`;
}

/**
 * Whether the runner should handle a file.
 * @param {string} filename
 * @returns {boolean}
 */
export function isPythonFile(filename) {
	return String(filename || "")
		.toLowerCase()
		.endsWith(".py");
}

let pyodidePromise = null;

/**
 * Loads Pyodide once and caches the promise.
 * @returns {Promise<object>} pyodide instance
 */
async function loadPyodide() {
	if (!pyodidePromise) {
		pyodidePromise = new Promise((resolve, reject) => {
			if (typeof window.loadPyodide === "function") {
				window.loadPyodide({ indexURL: PYODIDE_CDN }).then(resolve, reject);
				return;
			}
			const script = document.createElement("script");
			script.src = getPyodideScriptUrl();
			script.onload = () => {
				window.loadPyodide({ indexURL: PYODIDE_CDN }).then(resolve, reject);
			};
			script.onerror = () =>
				reject(new Error("Failed to download Pyodide (check connection)"));
			document.head.appendChild(script);
		});
	}
	return pyodidePromise;
}

/**
 * Runs Python code and returns its stdout+stderr output.
 * @param {string} code Python source
 * @returns {Promise<{stdout: string, stderr: string, result: string|null}>}
 */
export async function runPythonCode(code) {
	const pyodide = await loadPyodide();
	let stdout = "";
	let stderr = "";
	pyodide.setStdout({ batched: (text) => (stdout += `${text}\n`) });
	pyodide.setStderr({ batched: (text) => (stderr += `${text}\n`) });
	let result = null;
	try {
		result = pyodide.runPython(code);
		if (result !== undefined && result !== null) {
			result = String(result);
		}
	} finally {
		pyodide.setStdout({ batched: () => {} });
		pyodide.setStderr({ batched: () => {} });
	}
	return { stdout, stderr, result: result ?? null };
}

/**
 * Command entry: runs the active file as Python.
 */
export default async function runPython() {
	const file = window.editorManager?.activeFile;
	if (!file) return;
	if (!isPythonFile(file.filename)) {
		window.toast("Open a .py file to run it");
		return;
	}
	const code = getDocText(file.session.doc);
	window.toast("Python: downloading runtime (first run only)…");
	try {
		const { stdout, stderr, result } = await runPythonCode(code);
		const output = [stdout, stderr].filter(Boolean).join("");
		if (result !== null && !output) {
			console.log(`[py] ${result}`);
		}
		(stdout || "")
			.split("\n")
			.filter(Boolean)
			.forEach((line) => console.log(`[py] ${line}`));
		(stderr || "")
			.split("\n")
			.filter(Boolean)
			.forEach((line) => console.error(`[py] ${line}`));
		window.toast(
			stderr ? "Python: finished with errors" : "Python: finished ✓",
		);
	} catch (error) {
		console.error(`[py] ${error?.message || error}`);
		window.toast(`Python error: ${error?.message || "failed"}`);
	}
}
