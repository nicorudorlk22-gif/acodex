/**
 * Breadcrumbs bar: shows the path of the active file below the header.
 * Updates on every file switch and rename.
 */
/**
 * Splits a file uri into breadcrumb segments relative to the opened folder.
 * @param {string} uri active file uri
 * @param {string|null} rootDir opened folder url
 * @returns {string[]} segments, root first, filename last
 */
export function buildCrumbs(uri, rootDir) {
	if (!uri) return [];
	const filename = uri.split("/").filter(Boolean).pop() || uri;
	if (!rootDir) return [filename];
	const rootPart = rootDir.replace(/\/+$/, "");
	if (!uri.startsWith(rootPart)) return [filename];
	const rest = uri.slice(rootPart.length).replace(/^\/+/, "");
	if (!rest) return [filename];
	return rest.split("/").filter(Boolean);
}

let bar = null;
let enabled = true;

function render() {
	if (!bar) return;
	const file = window.editorManager?.activeFile;
	if (!file) {
		bar.textContent = "";
		return;
	}
	const rootDir = window.addedFolder?.[0]?.url || null;
	const crumbs = buildCrumbs(file.uri || file.filename, rootDir);
	bar.textContent = "";
	crumbs.forEach((crumb, index) => {
		const isLast = index === crumbs.length - 1;
		if (index > 0) {
			bar.append(
				tag("span", { className: "crumb-sep", textContent: "\u203a" }),
			);
		}
		bar.append(
			tag("span", {
				className: "crumb" + (isLast ? " crumb-active" : ""),
				textContent: crumb,
				title: crumb,
			}),
		);
	});
}

/**
 * Mounts the breadcrumbs bar under the header.
 * @param {HTMLElement} headerEl the app header element
 */
export function initBreadcrumbs(headerEl) {
	if (!headerEl || bar) return;
	bar = tag("div", {
		className: "acodex-breadcrumbs",
		id: "acodex-breadcrumbs",
	});
	const style = document.createElement("style");
	style.textContent = [
		".acodex-breadcrumbs{position:absolute;left:0;right:0;top:" +
			(headerEl.getBoundingClientRect().height + 1) +
			"px;",
		"display:flex;align-items:center;overflow-x:auto;white-space:nowrap;",
		"font-size:.75rem;padding:2px 10px;z-index:50;",
		"background:var(--secondary-color,#ffffff);",
		"color:var(--secondary-text-color,#999);",
		"border-bottom:1px solid var(--border-color,rgba(0,0,0,.2));scrollbar-width:none}",
		".acodex-breadcrumbs::-webkit-scrollbar{display:none}",
		".acodex-breadcrumbs .crumb-sep{margin:0 4px;opacity:.6}",
		".acodex-breadcrumbs .crumb-active{color:var(--primary-text-color,#fff);font-weight:600}",
	].join("");
	document.head.appendChild(style);
	document.body.appendChild(bar);
	bar.style.display = enabled ? "flex" : "none";
	window.editorManager.on("switch-file", render);
	window.editorManager.on("rename-file", render);
	render();
}

/** @param {boolean} value show or hide the bar */
export function setBreadcrumbsEnabled(value) {
	enabled = value;
	if (bar) bar.style.display = enabled ? "flex" : "none";
}

export function getBreadcrumbsBar() {
	return bar;
}

export default initBreadcrumbs;
