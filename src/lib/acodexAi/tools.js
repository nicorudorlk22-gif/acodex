export const MAX_FILE_CHARS = 30000;

/** Commands the assistant must never run on its own. */
export const BLOCKED_COMMANDS = new Set([
	"exit",
	"close-all-tabs",
	"close-other-tabs",
	"close-tabs-to-left",
	"close-tabs-to-right",
	"close-tabs-in-group",
	"open-log-file",
	"copy-device-info",
]);

/**
 * @typedef {object} ToolDeps
 * @property {() => any} getActiveFile Returns the active EditorFile or null
 * @property {() => any[]} getOpenFiles Returns all open EditorFiles
 * @property {() => any} getEditor Returns the active CodeMirror EditorView
 * @property {(name: string, text: string) => void} createFile
 * @property {(uri: string) => Promise<void>} openFile
 * @property {(file: any) => void} switchFile
 * @property {(command: string, arg?: any) => any} execCommand
 * @property {() => string[]} listCommands
 * @property {(title: string, message: string) => Promise<boolean>} confirm
 */

/**
 * @param {string} text
 */
export function truncate(text, max = MAX_FILE_CHARS) {
	if (text.length <= max) return { text, truncated: false };
	return { text: text.slice(0, max), truncated: true };
}

/**
 * @param {any} file
 */
function describeFile(file) {
	return {
		id: file.id,
		name: file.filename ?? file.name,
		uri: file.uri ?? null,
		unsaved: Boolean(file.isUnsaved),
	};
}

/**
 * @param {ToolDeps} deps
 */
export function createToolRegistry(deps) {
	/** @type {Record<string, {description: string, parameters: object, run: (args: any) => Promise<any>|any}>} */
	const tools = {
		get_active_file: {
			description:
				"Get the name, uri and full text of the file currently open in the editor.",
			parameters: { type: "object", properties: {} },
			run() {
				const file = deps.getActiveFile();
				const editor = deps.getEditor();
				if (!file || !editor) return { error: "No file is open." };
				const { text, truncated } = truncate(editor.state.doc.toString());
				return { ...describeFile(file), content: text, truncated };
			},
		},
		get_selection: {
			description: "Get the text currently selected in the editor.",
			parameters: { type: "object", properties: {} },
			run() {
				const editor = deps.getEditor();
				if (!editor) return { error: "No editor available." };
				const { from, to } = editor.state.selection.main;
				return { from, to, text: editor.state.doc.sliceString(from, to) };
			},
		},
		list_open_files: {
			description: "List every file open in editor tabs.",
			parameters: { type: "object", properties: {} },
			run() {
				return { files: deps.getOpenFiles().map(describeFile) };
			},
		},
		switch_to_file: {
			description: "Make an already-open tab the active file, by its id.",
			parameters: {
				type: "object",
				properties: { id: { type: "string" } },
				required: ["id"],
			},
			run({ id }) {
				const file = deps.getOpenFiles().find((f) => f.id === id);
				if (!file) return { error: `No open file with id ${id}.` };
				deps.switchFile(file);
				return { ok: true, file: describeFile(file) };
			},
		},
		replace_active_file: {
			description:
				"Replace the entire content of the active file with new content. Use for refactors and multi-line edits. The user must approve.",
			parameters: {
				type: "object",
				properties: { content: { type: "string" } },
				required: ["content"],
			},
			async run({ content }) {
				const file = deps.getActiveFile();
				const editor = deps.getEditor();
				if (!file || !editor) return { error: "No file is open." };
				if (typeof content !== "string") return { error: "content required." };
				const approved = await deps.confirm(
					"Acodex AI",
					`Substituir o conteúdo de "${file.filename ?? file.name}"?`,
				);
				if (!approved) return { error: "User rejected the change." };
				editor.dispatch({
					changes: { from: 0, to: editor.state.doc.length, insert: content },
				});
				return { ok: true };
			},
		},
		insert_text: {
			description:
				"Insert text at the cursor, replacing the current selection if any.",
			parameters: {
				type: "object",
				properties: { text: { type: "string" } },
				required: ["text"],
			},
			run({ text }) {
				const editor = deps.getEditor();
				if (!editor) return { error: "No editor available." };
				if (typeof text !== "string") return { error: "text required." };
				const { from, to } = editor.state.selection.main;
				editor.dispatch({
					changes: { from, to, insert: text },
					selection: { anchor: from + text.length },
				});
				return { ok: true };
			},
		},
		create_file: {
			description: "Create a new unsaved editor tab with a name and content.",
			parameters: {
				type: "object",
				properties: {
					name: { type: "string" },
					content: { type: "string" },
				},
				required: ["name"],
			},
			run({ name, content = "" }) {
				if (!name || /[\\/:*?"<>|]/.test(name)) {
					return { error: "Invalid file name." };
				}
				deps.createFile(name, String(content));
				return { ok: true };
			},
		},
		open_file: {
			description: "Open a file from the device or project by its uri.",
			parameters: {
				type: "object",
				properties: { uri: { type: "string" } },
				required: ["uri"],
			},
			async run({ uri }) {
				if (!uri) return { error: "uri required." };
				await deps.openFile(uri);
				return { ok: true };
			},
		},
		list_commands: {
			description:
				"List Acodex app commands that can be run with run_command (themes, panes, search, terminal, save, format, etc.).",
			parameters: { type: "object", properties: {} },
			run() {
				return {
					commands: deps.listCommands().filter((c) => !BLOCKED_COMMANDS.has(c)),
				};
			},
		},
		run_command: {
			description:
				"Run an Acodex app command by name. Call list_commands first if unsure.",
			parameters: {
				type: "object",
				properties: { command: { type: "string" } },
				required: ["command"],
			},
			async run({ command }) {
				if (BLOCKED_COMMANDS.has(command)) {
					return { error: `Command "${command}" is not allowed.` };
				}
				if (!deps.listCommands().includes(command)) {
					return { error: `Unknown command "${command}".` };
				}
				await deps.execCommand(command);
				return { ok: true };
			},
		},
	};

	return {
		/** OpenAI-compatible tool definitions. */
		definitions: Object.entries(tools).map(([name, tool]) => ({
			type: "function",
			function: {
				name,
				description: tool.description,
				parameters: tool.parameters,
			},
		})),
		/**
		 * @param {string} name
		 * @param {string} rawArgs JSON string from the model
		 * @returns {Promise<object>}
		 */
		async execute(name, rawArgs) {
			const tool = tools[name];
			if (!tool) return { error: `Unknown tool "${name}".` };
			let args = {};
			try {
				args = rawArgs ? JSON.parse(rawArgs) : {};
			} catch {
				return { error: "Arguments were not valid JSON." };
			}
			try {
				return (await tool.run(args)) ?? { ok: true };
			} catch (error) {
				return { error: error?.message || String(error) };
			}
		},
	};
}
