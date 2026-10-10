/**
 * Safe Markdown/code rendering for the Acodex AI chat.
 * Everything is built with createElement/textContent, so model output can
 * never inject HTML. No innerHTML is used anywhere in this file.
 */

/**
 * Token color classes for the mini highlighter.
 * @typedef {"tok-comment"|"tok-string"|"tok-number"|"tok-keyword"|"tok-bool"|"tok-fn"} TokClass
 */

const KEYWORDS = new Set([
	// JS / TS
	"const",
	"let",
	"var",
	"function",
	"return",
	"if",
	"else",
	"for",
	"while",
	"do",
	"switch",
	"case",
	"break",
	"continue",
	"import",
	"export",
	"from",
	"as",
	"default",
	"class",
	"extends",
	"new",
	"this",
	"super",
	"typeof",
	"instanceof",
	"in",
	"of",
	"try",
	"catch",
	"finally",
	"throw",
	"async",
	"await",
	"yield",
	"static",
	"get",
	"set",
	"interface",
	"type",
	"enum",
	"implements",
	"private",
	"public",
	"protected",
	"readonly",
	"declare",
	"abstract",
	"satisfies",
	"keyof",
	"void",
	"delete",
	// Python
	"def",
	"elif",
	"lambda",
	"with",
	"pass",
	"raise",
	"assert",
	"global",
	"nonlocal",
	"except",
	"print",
	// Shell / misc
	"echo",
	"then",
	"fi",
]);

const LITERALS = new Set([
	"true",
	"false",
	"null",
	"undefined",
	"NaN",
	"Infinity",
	"None",
	"True",
	"False",
	"self",
]);

/**
 * Highlights source code into a fragment of spans.
 * @param {string} code
 * @param {string} lang
 * @returns {DocumentFragment}
 */
export function highlightCode(code, lang = "") {
	const $frag = document.createDocumentFragment();
	const hash =
		lang.includes("#") || lang.includes("bash") || lang.includes("sh");
	const master =
		/(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b[A-Za-z_$][\w$]*\b)/gi;
	let last = 0;
	let match;
	while ((match = master.exec(code))) {
		if (match.index > last) $frag.append(code.slice(last, match.index));
		const token = match[0];
		const $span = document.createElement("span");
		let cls = null;
		if (token.startsWith("/*") || token.startsWith("//")) cls = "tok-comment";
		else if (token.startsWith("#") && hash) cls = "tok-comment";
		else if (token.startsWith(`'`) || token.startsWith(`"`)) cls = "tok-string";
		else if (/^\d/.test(token)) cls = "tok-number";
		else if (KEYWORDS.has(token)) cls = "tok-keyword";
		else if (LITERALS.has(token)) cls = "tok-bool";
		else if (code[master.lastIndex] === "(") cls = "tok-fn";
		if (cls) $span.className = cls;
		$span.textContent = token;
		$frag.append($span);
		last = master.lastIndex;
	}
	if (last < code.length) $frag.append(code.slice(last));
	return $frag;
}

/**
 * Renders inline Markdown (bold, inline code, links as plain text) safely.
 * @param {string} text
 * @returns {DocumentFragment}
 */
export function renderInline(text) {
	const $frag = document.createDocumentFragment();
	const master = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|_[^_\n]+_)/g;
	let last = 0;
	let match;
	while ((match = master.exec(text))) {
		if (match.index > last) $frag.append(text.slice(last, match.index));
		const token = match[0];
		if (token.startsWith("**")) {
			const $b = document.createElement("strong");
			$b.textContent = token.slice(2, -2);
			$frag.append($b);
		} else if (token.startsWith("`")) {
			const $code = document.createElement("code");
			$code.className = "ai-inline-code";
			$code.textContent = token.slice(1, -1);
			$frag.append($code);
		} else {
			const $i = document.createElement("em");
			$i.textContent = token.slice(1, -1);
			$frag.append($i);
		}
		last = master.lastIndex;
	}
	if (last < text.length) $frag.append(text.slice(last));
	return $frag;
}

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

/**
 * Fallback clipboard write for WebViews without the async clipboard API.
 * @param {string} text
 */
export async function copyText(text) {
	try {
		await navigator.clipboard?.writeText(text);
		return true;
	} catch {
		// ignore and try the legacy path
	}
	try {
		const $tmp = document.createElement("textarea");
		$tmp.value = text;
		$tmp.style.cssText = "position:fixed;opacity:0;";
		document.body.append($tmp);
		$tmp.select();
		document.execCommand("copy");
		$tmp.remove();
		return true;
	} catch {
		return false;
	}
}

/**
 * Builds a complete assistant message body from Markdown,
 * with syntax-highlighted code blocks and copy buttons.
 * @param {string} markdown
 * @returns {HTMLElement}
 */
export function renderAssistantMessage(markdown) {
	const $msg = document.createElement("div");
	$msg.className = "ai-msg-body";
	for (const part of splitMarkdownCode(markdown)) {
		if (part.type === "code") {
			const $pre = document.createElement("pre");
			$pre.className = "ai-code";
			const $code = document.createElement("code");
			$code.append(highlightCode(part.text, part.lang || ""));
			$pre.append($code);
			const $bar = document.createElement("div");
			$bar.className = "ai-code-bar";
			if (part.lang) {
				const $lang = document.createElement("span");
				$lang.className = "ai-code-lang";
				$lang.textContent = part.lang;
				$bar.append($lang);
			}
			const $copy = document.createElement("button");
			$copy.type = "button";
			$copy.className = "ai-copy";
			$copy.textContent = "Copiar";
			$copy.onclick = async () => {
				$copy.textContent = (await copyText(part.text))
					? "Copiado ✓"
					: "Falhou";
				setTimeout(() => ($copy.textContent = "Copiar"), 1600);
			};
			$bar.append($copy);
			$pre.append($bar);
			$msg.append($pre);
		} else {
			const $p = document.createElement("p");
			$p.append(renderInline(part.text));
			$msg.append($p);
		}
	}
	return $msg;
}
