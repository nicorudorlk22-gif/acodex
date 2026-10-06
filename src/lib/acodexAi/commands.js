/**
 * Dedicated AI commands for the editor: explain, refactor, generate tests
 * and fix errors. Operate on the current selection (or whole file) and show
 * the result in a dialog with copy / insert / replace actions.
 */
import { getDocText } from "cm/editorUtils";
import toast from "components/toast";
import alert from "dialogs/alert";
import loader from "dialogs/loader";
import select from "dialogs/select";
import { createChatCompletion } from "lib/acodexAi/client";
import appSettings from "lib/settings";

/**
 * The AI command ids and their prompt templates.
 * @type {Record<string, {label: string, template: (code: string, filename: string) => string}>}
 */
export const AI_COMMANDS = {
	explain: {
		label: "Explain this code",
		template: (code, filename) =>
			`Explain the following code from "${filename}" in clear, simple language.
Describe what it does, notable design decisions and possible bugs.
Use short paragraphs. Answer in the language the code's comments use, else English.\n\n${code}`,
	},
	refactor: {
		label: "Refactor this code",
		template: (code, filename) =>
			`Refactor the following code from "${filename}".
Keep the exact same behavior. Reply ONLY with the refactored code, no explanations, no markdown fences.
Preserve the original language and style.\n\n${code}`,
	},
	tests: {
		label: "Generate tests for this code",
		template: (code, filename) =>
			`Write unit tests for the following code from "${filename}".
Pick the most natural test framework for the language (Vitest for JS/TS, pytest for Python, etc).
Reply ONLY with the test code, no explanations, no markdown fences.\n\n${code}`,
	},
	fix: {
		label: "Fix errors in this code",
		template: (code, filename) =>
			`Find and fix bugs in the following code from "${filename}".
Reply ONLY with the corrected code, no explanations, no markdown fences.\n\n${code}`,
	},
};

/**
 * Collects the text the command should operate on.
 * Selection if any, otherwise the whole file.
 * @param {object} file Active editor file
 * @returns {{text: string, hasSelection: boolean, range: {from: number, to: number}}}
 */
export function getCommandSource(file) {
	const view = window.editorManager?.editor;
	const selection = view?.state?.selection?.main;
	if (selection && !selection.empty) {
		return {
			text: getDocText(file.session.doc).slice(selection.from, selection.to),
			hasSelection: true,
			range: { from: selection.from, to: selection.to },
		};
	}
	return {
		text: getDocText(file.session.doc),
		hasSelection: false,
		range: null,
	};
}

/**
 * Sends code to the AI with one of the command prompts.
 * @param {"explain"|"refactor"|"tests"|"fix"} commandId
 * @param {string} code
 * @param {string} filename
 * @returns {Promise<string>} model response text
 */
export async function runAiCommand(commandId, code, filename) {
	const command = AI_COMMANDS[commandId];
	if (!command) throw new Error(`Unknown AI command: ${commandId}`);
	const { aiBaseUrl, aiApiKey, aiModel } = appSettings.value;
	if (!aiApiKey?.trim()) {
		throw new Error(
			"Configure your AI key in the AI sidebar settings first",
		);
	}
	const message = await createChatCompletion({
		config: { baseUrl: aiBaseUrl, apiKey: aiApiKey, model: aiModel },
		messages: [{ role: "user", content: command.template(code, filename) }],
	});
	return String(message.content || "").trim();
}

/**
 * Shows the AI result dialog with actions.
 * @param {string} commandId
 * @param {string} result
 * @param {object} file
 */
function showResult(commandId, result, file) {
	const isCodeOnly =
		commandId === "refactor" || commandId === "tests" || commandId === "fix";
	if (isCodeOnly && !file) {
		alert("Acodex AI", result);
		return;
	}
	const options = [
		["copy", "Copy"],
		...(file
			? [
					["insert", "Insert at cursor"],
					["newfile", "Save as new file"],
				]
			: []),
	];
	select("Acodex AI", options).then(async (action) => {
		if (!action) return;
		if (action === "copy") {
			navigator.clipboard?.writeText(result);
			toast("Copied");
			return;
		}
		const editor = window.editorManager.editor;
		if (action === "insert") {
			const pos = editor.state.selection.main.head;
			editor.dispatch({
				changes: { from: pos, insert: `${result}\n` },
			});
			toast("Inserted");
		} else if (action === "newfile") {
			const { default: EditorFile } = await import("lib/editorFile");
			const extension = file.filename.match(/\.[^.]+$/)?.[0] || ".txt";
			const newFilename = `${file.filename.replace(/\.[^.]+$/, "")}-${commandId}${extension}`;
			new EditorFile(newFilename, {
				isUnsaved: false,
				text: result,
			});
			toast("New file created");
		}
	});
}

/**
 * Main entry: runs one of the AI commands on the active file.
 * @param {"explain"|"refactor"|"tests"|"fix"} commandId
 */
export default async function aiCommand(commandId) {
	const file = editorManager.activeFile;
	if (!file) {
		toast("No file open");
		return;
	}
	const source = getCommandSource(file);
	if (!source.text.trim()) {
		toast("Nothing to send");
		return;
	}
	loader.create(strings["ai working"] || "AI working…", "", undefined, true);
	try {
		const result = await runAiCommand(commandId, source.text, file.filename);
		loader.destroy();
		showResult(commandId, result, file);
	} catch (error) {
		loader.destroy();
		toast(error?.message || "AI request failed");
	}
}
