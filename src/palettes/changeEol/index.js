import { getDocText } from "cm/editorUtils";
import palette from "components/palette";
import toast from "components/toast";
import confirm from "dialogs/confirm";

const EOL_OPTIONS = [
	{ id: "\n", label: "LF", hint: "Unix / Linux / macOS" },
	{ id: "\r\n", label: "CRLF", hint: "Windows" },
];

/**
 * Converts line endings of text.
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
export function convertEol(text, from, to) {
	if (!text || from === to) return text;
	// First normalize everything to LF, then expand to the target.
	const normalized = from === "\r\n" ? text.split("\r\n").join("\n") : text;
	if (to === "\r\n") return normalized.split("\n").join("\r\n");
	return normalized;
}

/**
 * Detects the dominant EOL of a text.
 * @param {string} text
 * @returns {string} "\n" or "\r\n"
 */
export function detectEol(text) {
	if (!text) return "\n";
	const crlf = (text.match(/\r\n/g) || []).length;
	const lf = (text.match(/(?<!\r)\n/g) || []).length;
	return crlf > lf ? "\r\n" : "\n";
}

export default function changeEol() {
	const file = editorManager.activeFile;
	if (!file) return;

	const current = detectEol(getDocText(file.session));
	const currentLabel = current === "\r\n" ? "CRLF" : "LF";
	const title =
		(strings["line endings"] || "Line endings") + ` (${currentLabel})`;

	palette(
		() =>
			EOL_OPTIONS.map((option) => ({
				value: option.id,
				text: `<div class="palette-content-eol">
      <span>${option.label}${option.id === current ? " ✓" : ""}</span>
      <small>${option.hint}</small>
    <div>`,
			})),
		async (target) => {
			if (target === current) return;
			const targetLabel = target === "\r\n" ? "CRLF" : "LF";
			const message =
				strings["change line endings message"] ||
				`Convert line endings of ${file.filename} to ${targetLabel}?`;
			const confirmed = await confirm(
				strings["line endings"] || "Line endings",
				message,
			);
			if (!confirmed) return;

			const editor = editorManager.editor;
			const cursorPosition = editor.getCursorPosition();
			const converted = convertEol(getDocText(file.session), current, target);
			file.session.setValue(converted);
			editor.moveCursorToPosition(cursorPosition);
			editorManager.onupdate("eol");
			toast(`${targetLabel} ✓`);
		},
		title,
	);
}
