/**
 * First-run onboarding: a one-time dialog summarizing Acodex features.
 */
export const ONBOARDING_FLAG = "acodex-onboarded";

/**
 * Whether onboarding should be shown.
 * @param {Storage} storage localStorage-like
 * @returns {boolean}
 */
export function shouldShowOnboarding(storage) {
	return !storage?.getItem(ONBOARDING_FLAG);
}

/**
 * Marks onboarding as done.
 * @param {Storage} storage
 */
export function markOnboarded(storage) {
	storage?.setItem(ONBOARDING_FLAG, String(Date.now()));
}

/**
 * Shows the one-time getting started dialog.
 */
export default async function showOnboarding() {
	const storage = window.localStorage;
	if (!shouldShowOnboarding(storage)) return;
	const { default: alert } = await import("dialogs/alert");
	alert(
		globalThis.strings?.["welcome to acodex"] || "Welcome to Acodex",
		[
			globalThis.strings?.["onboarding tips"] || "Here is what is new:",
			"\u2022 Command palette: run commands fast",
			"\u2022 AI: explain, refactor, tests and inline ghost text",
			"\u2022 Git: init, commit, push and pull right on your device",
			"\u2022 Live server: preview with auto-reload",
			"\u2022 Python: run .py files with Pyodide",
		].join("\n"),
	);
	markOnboarded(storage);
}
