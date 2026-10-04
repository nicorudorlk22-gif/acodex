/**
 * Splits assistant Markdown into plain text and fenced code parts.
 * Rendered with textContent only, so model output can never inject HTML.
 * @param {string} markdown
 * @returns {{type: "text"|"code", text: string, lang?: string}[]}
 */
export function splitMarkdownCode(markdown) {
	const parts = [];
	const fence = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g;
	let last = 0;
	for (const match of markdown.matchAll(fence)) {
		const before = markdown.slice(last, match.index).trim();
		if (before) parts.push({ type: "text", text: before });
		parts.push({
			type: "code",
			lang: match[1] || "",
			text: match[2].replace(/\n$/, ""),
		});
		last = match.index + match[0].length;
	}
	const rest = markdown.slice(last).trim();
	if (rest) parts.push({ type: "text", text: rest });
	return parts;
}
